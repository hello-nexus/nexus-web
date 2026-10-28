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
import { GESTURE_ENGAGE_PX } from '../engine/gestureThresholds';
import { computeVisible, dragHidesTiles } from './webViewVisibility';
import { measureTile } from './webViewMeasure';

export type WebViewHostStatus = 'idle' | 'pending' | 'supported' | 'unsupported';

export interface WebViewViewState {
  state: WebViewLoadState;
  code?: string;
  canGoBack: boolean;
  canGoForward?: boolean;
  away?: boolean;
}

export interface WebViewHostSnapshot {
  status: WebViewHostStatus;
  interactive: boolean;
  contextMenu: boolean;
  navControls: boolean;
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
  /** Tile claims only: the native view takes the touch, so the page can be used in place. */
  touchPage?: boolean;
}

export interface WebViewClaimHandle {
  setUrl: (url: string) => void;
  setZoom: (zoom: number) => void;
  setRefreshMinutes: (minutes: number) => void;
  setTouchPage: (touchPage: boolean) => void;
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
// Where a drag starts that belongs to a list or other scroller: never a pull or swipe of the panel.
const SCROLLABLE_SELECTOR = '[data-panel-scrollable="true"]';
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
  private contextMenu = false;
  private longPress = false;
  private navControls = false;
  private gestureEngagePx = GESTURE_ENGAGE_PX;
  private interactiveTiles = false;
  private contextMenuListeners = new Set<(id: string, x: number, y: number) => void>();
  private snapshot: WebViewHostSnapshot = { status: 'idle', interactive: false, contextMenu: false, navControls: false, maxViews: 0, views: {}, overLimit: [] };
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
  private pointers = new Map<number, { x: number; y: number; moved: boolean; scroller: boolean }>();
  private gestureActive = false;
  private sentViews = new Map<string, { visible: boolean; interactive: boolean }>();
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
      setTouchPage: (touchPage: boolean) => {
        if ((rec.touchPage ?? false) === touchPage) return;
        rec.touchPage = touchPage;
        this.schedule();
      },
      release: () => {
        if (!this.claims.delete(rec.key)) return;
        this.resizeObserver?.unobserve(rec.element);
        this.schedule();
        this.updateRefreshTimers();
      },
    };
  }

  /** Tiles take the mouse themselves; applies only on a host that reports right-clicks, so the widget menu stays reachable. */
  setInteractiveTiles(value: boolean): void {
    if (this.interactiveTiles === value) return;
    this.interactiveTiles = value;
    this.schedule();
  }

  /** Finger travel, in CSS px, at which a vertical drag counts as a sheet pull and hides the tiles. */
  setGestureEngagePx(px: number): void {
    this.gestureEngagePx = Number.isFinite(px) && px > 0 ? px : GESTURE_ENGAGE_PX;
  }

  /** Whether the tile of widget `id` is a native view shown to the host as interactive right now, so a tap on it never reaches the panel. */
  tileTakesTouch(id: string): boolean {
    const c = this.winnerOf(id);
    if (!c || c.immersive || c.touchPage !== true || this.overLimit.has(id) || this.status !== 'supported') return false;
    const sent = this.sentViews.get(id);
    return sent?.visible === true && sent.interactive && this.viewStates[id]?.state === 'loaded';
  }

  /** A right-click the host saw on an interactive view. */
  onContextMenu(listener: (id: string, x: number, y: number) => void): () => void {
    this.contextMenuListeners.add(listener);
    return () => { this.contextMenuListeners.delete(listener); };
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
    this.on(window, 'pointerdown', e => {
      const scroller = e.target instanceof Element && e.target.closest(SCROLLABLE_SELECTOR) !== null;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false, scroller });
    }, true);
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
      this.contextMenu = msg.contextMenu;
      this.longPress = msg.longPress;
      this.navControls = msg.navControls;
      this.maxViews = msg.maxViews;
      this.emit();
      if (this.status === 'supported') this.flush(true);
      return;
    }
    if (msg.type === 'nexus.webview.contextmenu') {
      // An immersive claim owns the page: a hold inside it must not open the tile's menu.
      if (this.winnerOf(msg.id)?.immersive) return;
      for (const l of [...this.contextMenuListeners]) l(msg.id, msg.x, msg.y);
      return;
    }
    this.viewStates = {
      ...this.viewStates,
      [msg.id]: { state: msg.state, code: msg.code, canGoBack: msg.canGoBack, canGoForward: msg.canGoForward, away: msg.away },
    };
    this.emit();
    // An error or crash hides the native view, so the placeholder shows.
    this.schedule();
  }

  // Swipes and pulls move content with inline transforms, which no observer
  // sees: re-measure on every move. Tiles hide only once a drag is a vertical
  // pull (the tray or control center sheets); taps, controls, scrolling lists
  // and horizontal page swipes keep them shown, so a tile follows its page.
  private onPointerMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (!p.moved && !p.scroller && dragHidesTiles(e.clientX - p.x, e.clientY - p.y, this.gestureEngagePx)) {
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
      contextMenu: this.contextMenu,
      navControls: this.navControls,
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

  private winnerOf(id: string): ClaimRecord | undefined {
    let win: ClaimRecord | undefined;
    for (const c of this.claims.values()) {
      if (c.id === id && (!win || (c.immersive && !win.immersive))) win = c;
    }
    return win;
  }

  // Touch in place needs both the host's long-press report and its menu path, so an older host keeps tap-to-open.
  private viewInteractive(c: ClaimRecord): boolean {
    if (!this.interactive) return false;
    if (c.immersive) return true;
    if (!this.contextMenu) return false;
    return this.interactiveTiles || (c.touchPage === true && this.longPress);
  }

  private buildViews(): WebViewSyncView[] {
    const supported = this.status === 'supported';
    const documentVisible = document.visibilityState !== 'hidden';
    const hit = (x: number, y: number) => document.elementFromPoint(x, y);
    const covered = document.querySelector(COVER_SELECTOR) !== null;
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const views: WebViewSyncView[] = [];
    for (const id of this.slotOrder) {
      const c = this.winnerOf(id);
      if (!c || this.overLimit.has(id)) continue;
      const { rect, target, radius } = measureTile(c.element);
      const st = this.viewStates[c.id]?.state;
      views.push({
        id: c.id,
        url: c.url,
        rect,
        radius,
        zoom: clampZoom(c.zoom),
        interactive: this.viewInteractive(c),
        immersive: c.immersive || undefined,
        visible: computeVisible({
          supported,
          documentVisible,
          suppressed: this.suppressed || covered || (this.gestureActive && !c.immersive),
          connected: c.element.isConnected,
          loadFailed: st === 'error' || st === 'crashed',
          rect,
          el: target,
          hit,
          viewport,
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
    this.sentViews = new Map(views.map(v => [v.id, { visible: v.visible, interactive: v.interactive }]));
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
