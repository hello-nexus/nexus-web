import {
  CAPS_TIMEOUT_MS,
  HEARTBEAT_MS,
  WEBVIEW_PROTOCOL_VERSION,
  clampZoom,
  detectTransport,
  parseInbound,
  type WebViewCommandName,
  type WebViewInbound,
  type WebViewLoadState,
  type WebViewOutbound,
  type WebViewSyncView,
  type WebViewTransport,
} from './webViewProtocol';
import { computeVisible } from './webViewVisibility';
import { measureTile } from './webViewMeasure';

export type WebViewHostStatus = 'idle' | 'pending' | 'supported' | 'unsupported';

export interface WebViewViewState {
  state: WebViewLoadState;
  code?: string;
  canGoBack: boolean;
}

export interface WebViewHostSnapshot {
  status: WebViewHostStatus;
  interactive: boolean;
  maxViews: number;
  views: Readonly<Record<string, WebViewViewState>>;
  /** Ids past the host's view limit: never synced, shown a placeholder. */
  overLimit: readonly string[];
}

export interface WebViewClaimInput {
  /** Widget instance id. The tile and the immersive view of one widget share it. */
  id: string;
  /** The configured url, never the view's current location. */
  url: string;
  /** The placeholder element whose rect the native view takes. */
  element: HTMLElement;
  /** The immersive claim owns the rect and the input while it exists. */
  immersive: boolean;
  /** Page zoom factor; defaults to 1. */
  zoom?: number;
  /** Tile claims only: reload every N minutes while the tile is what is shown. 0 or absent is off. */
  refreshMinutes?: number;
}

export interface WebViewClaimHandle {
  setUrl: (url: string) => void;
  setZoom: (zoom: number) => void;
  setRefreshMinutes: (minutes: number) => void;
  release: () => void;
}

interface ClaimRecord extends WebViewClaimInput {
  key: number;
}

// How long layout keeps being re-measured after a transition or animation
// starts, so a sliding overlay carries the native view with it.
const BURST_MS = 600;
// The most views any host accepts.
const MAX_VIEWS = 4;
// A finger travels this far before it counts as a swipe or pull.
const GESTURE_SLOP_PX = 6;
// The panel's own click-through layers (hints, notices) mark themselves so
// the topmost check, which skips them, can still hide the native view.
const COVER_SELECTOR = '[data-webview-cover]';

const EMPTY_KEY = JSON.stringify([null, []]);

/**
 * The single owner of the native web-view bridge for the whole panel page.
 * Widget instances register claims; the host turns the set of claims into the
 * declarative `sync` stream. One native view exists per widget id: the tile
 * and the immersive view are two claims on the same id, and the sync is
 * derived from the claim set at flush time, so swapping one claim for the
 * other never produces a message without the id.
 */
export class WebViewHost {
  private claims = new Map<number, ClaimRecord>();
  private nextKey = 1;
  private transport: WebViewTransport | null = null;
  private status: WebViewHostStatus = 'idle';
  private interactive = false;
  private maxViews = 0;
  private viewStates: Record<string, WebViewViewState> = {};
  private snapshot: WebViewHostSnapshot = { status: 'idle', interactive: false, maxViews: 0, views: {}, overLimit: [] };
  private listeners = new Set<() => void>();
  private suppressed = false;
  private pageHidden = false;
  private seq = 0;
  private lastKey: string | null = null;
  private rafPending = false;
  private burstUntil = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private capsTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private teardown: Array<() => void> = [];
  // Stable slots: an id keeps its place while it has any claim, so tile and
  // immersive share one, and a re-register never reorders the others.
  private slotOrder: string[] = [];
  private overLimit = new Set<string>();
  private pointers = new Map<number, { x: number; y: number; moved: boolean }>();
  private gestureActive = false;
  private refreshTimers = new Map<string, { minutes: number; handle: ReturnType<typeof setInterval> }>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): WebViewHostSnapshot => this.snapshot;

  register(input: WebViewClaimInput): WebViewClaimHandle {
    if (this.status === 'idle') this.start();
    const rec: ClaimRecord = { ...input, key: this.nextKey++ };
    this.claims.set(rec.key, rec);
    this.resizeObserver?.observe(rec.element);
    if (this.reconcileSlots()) this.emit();
    this.ensureHeartbeat();
    this.schedule();
    this.updateRefreshTimers();
    return {
      setUrl: (url: string) => {
        if (rec.url === url) return;
        rec.url = url;
        this.schedule();
      },
      setZoom: (zoom: number) => {
        if (rec.zoom === zoom) return;
        rec.zoom = zoom;
        this.schedule();
      },
      setRefreshMinutes: (minutes: number) => {
        if (rec.refreshMinutes === minutes) return;
        rec.refreshMinutes = minutes;
        this.updateRefreshTimers();
      },
      release: () => {
        if (!this.claims.delete(rec.key)) return;
        this.resizeObserver?.unobserve(rec.element);
        this.schedule();
        this.updateRefreshTimers();
      },
    };
  }

  /** Edit or drag mode: every native view hides while true. */
  setSuppressed(value: boolean): void {
    if (this.suppressed === value) return;
    this.suppressed = value;
    this.schedule();
  }

  sendCommand(id: string, command: WebViewCommandName): void {
    if (!this.transport || this.status !== 'supported') return;
    this.transport.post({ type: 'nexus.webview.command', id, command });
    if (command === 'reload') {
      this.viewStates = { ...this.viewStates, [id]: { state: 'loading', canGoBack: this.viewStates[id]?.canGoBack ?? false } };
      this.emit();
      this.schedule();
    }
  }

  /** Detaches every listener and timer. Tests and hot reload only. */
  dispose(): void {
    for (const off of this.teardown) off();
    this.teardown = [];
    this.stopHeartbeat();
    for (const t of this.refreshTimers.values()) clearInterval(t.handle);
    this.refreshTimers.clear();
    if (this.capsTimer) clearTimeout(this.capsTimer);
    this.capsTimer = null;
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.claims.clear();
    this.listeners.clear();
  }

  private start(): void {
    this.transport = detectTransport();
    if (!this.transport) {
      this.status = 'unsupported';
      this.emit();
      return;
    }
    this.status = 'pending';
    this.attachListeners();
    this.transport.post({ type: 'nexus.webview.hello', version: WEBVIEW_PROTOCOL_VERSION });
    // A late caps still upgrades the status, so the timeout only picks the
    // placeholder shown meanwhile.
    this.capsTimer = setTimeout(() => {
      this.capsTimer = null;
      if (this.status === 'pending') {
        this.status = 'unsupported';
        this.stopHeartbeat();
        this.emit();
      }
    }, CAPS_TIMEOUT_MS);
    this.emit();
  }

  private on<K extends keyof WindowEventMap>(
    target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions | boolean,
  ): void {
    target.addEventListener(type, fn, opts);
    this.teardown.push(() => target.removeEventListener(type, fn, opts));
  }

  private attachListeners(): void {
    const nudge = () => this.schedule();
    // A burst-worthy event: layout may keep moving for a while after it.
    const burst = () => { this.burstUntil = Date.now() + BURST_MS; this.schedule(); };

    const onCustom = (e: Event) => this.handleInbound((e as CustomEvent).detail);
    window.addEventListener('nexus-webview', onCustom);
    this.teardown.push(() => window.removeEventListener('nexus-webview', onCustom));

    const wv2 = (window as unknown as { chrome?: { webview?: EventTarget } }).chrome?.webview;
    if (wv2 && typeof wv2.addEventListener === 'function') {
      const onMsg = (e: Event) => this.handleInbound((e as MessageEvent).data);
      wv2.addEventListener('message', onMsg);
      this.teardown.push(() => wv2.removeEventListener('message', onMsg));
    }

    this.on(window, 'resize', nudge);
    this.on(window, 'orientationchange', burst);
    this.on(window, 'scroll', nudge, { capture: true, passive: true });
    this.on(window, 'transitionrun', burst, true);
    this.on(window, 'transitionend', burst, true);
    this.on(window, 'animationstart', burst, true);
    this.on(window, 'animationend', burst, true);
    this.on(window, 'pointerdown', e => { this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false }); }, true);
    this.on(window, 'pointermove', e => this.onPointerMove(e), true);
    this.on(window, 'pointerup', e => this.onPointerEnd(e), true);
    this.on(window, 'pointercancel', e => this.onPointerEnd(e), true);
    this.on(window, 'pagehide', () => this.onPageHide());
    this.on(window, 'pageshow', () => this.onPageShow());
    const onVisibility = () => this.flush(false);
    document.addEventListener('visibilitychange', onVisibility);
    this.teardown.push(() => document.removeEventListener('visibilitychange', onVisibility));

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(nudge);
    }
    if (typeof MutationObserver !== 'undefined' && document.body) {
      // Overlays are added to the DOM; childList is enough to notice them.
      this.mutationObserver = new MutationObserver(nudge);
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  private handleInbound(raw: unknown): void {
    const msg: WebViewInbound | null = parseInbound(raw);
    if (!msg) return;
    if (msg.type === 'nexus.webview.caps') {
      if (this.capsTimer) { clearTimeout(this.capsTimer); this.capsTimer = null; }
      this.status = msg.supported ? 'supported' : 'unsupported';
      if (this.status === 'unsupported') this.stopHeartbeat();
      this.interactive = msg.interactive;
      this.maxViews = msg.maxViews;
      this.emit();
      if (this.status === 'supported') this.flush(true);
      return;
    }
    this.viewStates = {
      ...this.viewStates,
      [msg.id]: { state: msg.state, code: msg.code, canGoBack: msg.canGoBack },
    };
    this.emit();
    // An error or crash hides the native view, so the placeholder shows.
    this.schedule();
  }

  // Swipes and pulls move content with inline transforms, which no observer
  // sees: re-measure on every move, and hide the tiles once a drag begins so
  // none sits over a sheet being pulled in.
  private onPointerMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > GESTURE_SLOP_PX) {
      p.moved = true;
      this.gestureActive = true;
      this.flush(false);
      return;
    }
    this.schedule();
  }

  private onPointerEnd(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    this.gestureActive = Array.from(this.pointers.values()).some(p => p.moved);
    this.burstUntil = Date.now() + BURST_MS;
    this.schedule();
  }

  private onPageHide(): void {
    this.pageHidden = true;
    if (this.transport && this.status === 'supported') {
      this.send([]);
    }
    this.lastKey = EMPTY_KEY;
  }

  private onPageShow(): void {
    if (!this.pageHidden) return;
    this.pageHidden = false;
    this.lastKey = null;
    this.flush(true);
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat || !this.transport || this.status === 'unsupported') return;
    this.heartbeat = setInterval(() => this.flush(true), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  // rAF-throttled: any number of triggers in a frame produce one measurement.
  private schedule(): void {
    if (this.rafPending || !this.transport) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.flush(false);
      if (Date.now() < this.burstUntil) this.schedule();
    });
  }

  private emit(): void {
    this.reconcileSlots();
    this.snapshot = {
      status: this.status,
      interactive: this.interactive,
      maxViews: this.maxViews,
      views: this.viewStates,
      overLimit: Array.from(this.overLimit),
    };
    this.updateRefreshTimers();
    for (const l of [...this.listeners]) l();
  }

  // One reload timer per id, alive only while that id is shown as a tile on a
  // supported host and has not failed. An immersive claim removes it, so the
  // interval starts over when immersive closes. A timer whose interval is
  // unchanged is left running, so unrelated updates never postpone a reload.
  private updateRefreshTimers(): void {
    const want = new Map<string, number>();
    if (this.status === 'supported') {
      const immersiveIds = new Set<string>();
      for (const c of this.claims.values()) if (c.immersive) immersiveIds.add(c.id);
      for (const c of this.claims.values()) {
        const minutes = c.refreshMinutes ?? 0;
        const st = this.viewStates[c.id]?.state;
        if (c.immersive || immersiveIds.has(c.id) || this.overLimit.has(c.id) || minutes <= 0 || st === 'error' || st === 'crashed') continue;
        want.set(c.id, minutes);
      }
    }
    for (const [id, t] of this.refreshTimers) {
      if (want.get(id) !== t.minutes) {
        clearInterval(t.handle);
        this.refreshTimers.delete(id);
      }
    }
    for (const [id, minutes] of want) {
      if (this.refreshTimers.has(id)) continue;
      const handle = setInterval(() => this.sendCommand(id, 'reload'), minutes * 60_000);
      this.refreshTimers.set(id, { minutes, handle });
    }
  }

  private limit(): number {
    return this.maxViews > 0 ? Math.min(this.maxViews, MAX_VIEWS) : MAX_VIEWS;
  }

  // Drops slots with no claim, appends new ids, and recomputes which ids fall
  // past the limit. Returns whether the over-limit set changed.
  private reconcileSlots(): boolean {
    const live = new Set<string>();
    for (const c of this.claims.values()) live.add(c.id);
    this.slotOrder = this.slotOrder.filter(id => live.has(id));
    for (const id of live) if (!this.slotOrder.includes(id)) this.slotOrder.push(id);
    const next = new Set(this.slotOrder.slice(this.limit()));
    const changed = next.size !== this.overLimit.size || [...next].some(id => !this.overLimit.has(id));
    this.overLimit = next;
    return changed;
  }

  private buildViews(): WebViewSyncView[] {
    const supported = this.status === 'supported';
    const documentVisible = document.visibilityState !== 'hidden';
    const hit = (x: number, y: number) => document.elementFromPoint(x, y);
    const covered = document.querySelector(COVER_SELECTOR) !== null;
    const winners = new Map<string, ClaimRecord>();
    for (const c of this.claims.values()) {
      const cur = winners.get(c.id);
      if (!cur || (c.immersive && !cur.immersive)) winners.set(c.id, c);
    }
    const views: WebViewSyncView[] = [];
    for (const id of this.slotOrder) {
      const c = winners.get(id);
      if (!c || this.overLimit.has(id)) continue;
      const { rect, target, radius } = measureTile(c.element);
      const st = this.viewStates[c.id]?.state;
      views.push({
        id: c.id,
        url: c.url,
        rect,
        radius,
        zoom: clampZoom(c.zoom),
        interactive: c.immersive && this.interactive,
        visible: computeVisible({
          supported,
          documentVisible,
          suppressed: this.suppressed || covered || (this.gestureActive && !c.immersive),
          connected: c.element.isConnected,
          loadFailed: st === 'error' || st === 'crashed',
          rect,
          el: target,
          hit,
        }),
      });
    }
    return views;
  }

  private flush(force: boolean): void {
    if (!this.transport || this.status !== 'supported' || this.pageHidden) return;
    if (this.reconcileSlots()) this.emit();
    const views = this.buildViews();
    if (views.length === 0 && this.lastKey === null) return;
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const key = JSON.stringify([viewport, views]);
    if (views.length === 0) {
      if (this.lastKey !== EMPTY_KEY) this.send([]);
      this.lastKey = EMPTY_KEY;
      this.stopHeartbeat();
      return;
    }
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.ensureHeartbeat();
    this.send(views);
  }

  private send(views: WebViewSyncView[]): void {
    if (!this.transport) return;
    const msg: WebViewOutbound = {
      type: 'nexus.webview.sync',
      seq: ++this.seq,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      views,
    };
    this.transport.post(msg);
  }
}

export const webViewHost = new WebViewHost();
