// Host side of `ui-canvas`: owns one renderer worker plus the canvas it draws
// to, and speaks the renderer protocol (see sdk/runtime/rendererCore.ts). The
// session outlives a React unmount for a grace window. Mounts that pass the
// same `share` key reuse one live renderer, so a panel-grid drag remount or the
// immersive overlay keeps it: the element holding the canvas is reparented to
// the newest claimant. A mount without `share` has its own session, which a
// remount does not find again.

import type {
  CanvasPointerEvent, HostToRenderer, RendererSize, RendererToHost,
} from '../../../sdk/runtime/rendererCore';
import { composeRendererWorkerSource } from '../sandboxBoot';
import { fetchBundleFile } from '../../panel/widgets/marketplace/useSdkBundle';
import { fetchServiceBlob } from '../../api/service';

export type CanvasPhase = 'loading' | 'ready' | 'error';

const DISPOSE_GRACE_MS = 5000;
const BOOT_TIMEOUT_MS = 20_000;
const MAX_RESPAWNS = 1;
const MAX_PIXEL_RATIO = 1.5;
/** Set by a Layer while one of its Manipulable gestures is live. */
const LAYER_GESTURE_ATTR = 'data-layer-gesture-live';

/** Caps device pixel ratio the same way the lighting shader preview does (perf). */
export function cappedPixelRatio(): number {
  const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  return Math.min(Math.max(dpr, 1), MAX_PIXEL_RATIO);
}

/**
 * Whether the observed element is on screen after a batch of intersection
 * records. An observer can deliver several crossings in ONE callback; only the
 * newest record is the truth. An empty batch changes nothing.
 */
export function inViewFromEntries(entries: ReadonlyArray<{ isIntersecting: boolean }>, previous: boolean): boolean {
  return entries.length > 0 ? entries[entries.length - 1].isIntersecting : previous;
}

export interface AssetRef {
  /** Bundle-relative, segments percent-encoded. */
  path: string;
  /** Empty or a leading "?" plus a restricted charset, passed through unchanged. */
  query: string;
}

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 0x20) return true;
  return false;
}

const QUERY_PATTERN = /^\?[A-Za-z0-9_.=&%-]{0,128}$/;

/**
 * Normalises a renderer-supplied bundle path. Only a relative path inside the
 * app bundle passes; anything absolute, escaping with "..", or carrying a
 * scheme, backslash, control character or fragment is refused.
 */
export function normaliseAssetPath(raw: unknown): AssetRef | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  const q = raw.indexOf('?');
  const pathPart = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q);
  if (query !== '' && !QUERY_PATTERN.test(query)) return null;
  if (pathPart === '' || pathPart.startsWith('/') || /[\\#:]/.test(pathPart) || hasControlChar(pathPart)) return null;
  const segments: string[] = [];
  for (const seg of pathPart.split('/')) {
    let decoded: string;
    try { decoded = decodeURIComponent(seg); } catch { return null; }
    if (decoded === '' || decoded === '.' || decoded === '..') return null;
    if (/[/\\]/.test(decoded) || hasControlChar(decoded)) return null;
    segments.push(encodeURIComponent(decoded));
  }
  return { path: segments.join('/'), query };
}

export interface CanvasClaim {
  interactive: boolean;
  props: Record<string, unknown>;
  visible: boolean;
  onMessage: ((data: unknown) => void) | null;
}

export interface CanvasSpec {
  appId: string;
  renderer: string;
  /** Listing version; part of the identity so an update never reuses an old renderer. */
  version: string;
}

export class CanvasSession {
  /** Holds the current canvas; this is what moves between claimants. */
  readonly element: HTMLDivElement;
  phase: CanvasPhase = 'loading';
  private readonly listeners = new Set<() => void>();
  private readonly claims = new Map<HTMLElement, CanvasClaim>();
  private holder: HTMLElement | null = null;
  private canvas: HTMLCanvasElement;
  private worker: Worker | null = null;
  private rendererUrl: string | null = null;
  private bootUrl: string | null = null;
  private stopResolutionWatch: (() => void) | null = null;
  /** Forwarded pointers still down, with their last canvas position. */
  private readonly forwarded = new Map<number, { pointerType: string; x: number; y: number }>();
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private booted = false;
  private respawns = 0;
  private disposed = false;
  private lastSize: RendererSize | null = null;
  private lastPropsJson = '';
  private lastVisible = true;
  /** Pointers whose down was withheld; their remaining events are withheld too. */
  private readonly withheld = new Set<number>();
  private generation = 0;

  private readonly spec: CanvasSpec;

  constructor(spec: CanvasSpec) {
    this.spec = spec;
    this.element = document.createElement('div');
    this.element.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;pointer-events:none';
    this.canvas = this.newCanvas();
    this.element.appendChild(this.canvas);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
      this.element.addEventListener(t, this.onPointer as EventListener);
    }
    this.element.addEventListener('lostpointercapture', this.onLostCapture as EventListener);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.watchResolution();
    void this.start();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  get claimCount(): number {
    return this.claims.size;
  }

  isHolder(wrap: HTMLElement): boolean {
    return this.holder === wrap;
  }

  /** Registers a mount and hands it the canvas: the newest claimant holds it. */
  claim(wrap: HTMLElement, claim: CanvasClaim): void {
    this.claims.delete(wrap);
    this.claims.set(wrap, claim);
    this.attach(wrap);
  }

  /** Removes a mount; the canvas goes to the newest survivor. */
  release(wrap: HTMLElement): void {
    this.claims.delete(wrap);
    if (this.holder !== wrap) return;
    this.holder = null;
    const survivor = [...this.claims.keys()].pop();
    if (survivor) this.attach(survivor);
  }

  update(wrap: HTMLElement, patch: Partial<CanvasClaim>): void {
    const claim = this.claims.get(wrap);
    if (!claim) return;
    Object.assign(claim, patch);
    if (this.holder !== wrap) return;
    if (patch.interactive !== undefined) this.applyInteractive(claim);
    if (patch.props !== undefined) this.sendProps(claim);
    if (patch.visible !== undefined) this.sendVisible(claim);
  }

  /** Sends the holder's measured box; a non-holder's resize is ignored. */
  resize(wrap: HTMLElement): void {
    if (this.holder !== wrap) return;
    this.sendSize(wrap);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownWorker();
    this.stopResolutionWatch?.();
    this.stopResolutionWatch = null;
    this.element.remove();
    this.listeners.clear();
    this.claims.clear();
  }

  private newCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
    return canvas;
  }

  private setPhase(phase: CanvasPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.element.style.opacity = phase === 'ready' ? '1' : '0';
    for (const cb of [...this.listeners]) cb();
  }

  private attach(wrap: HTMLElement): void {
    // Moving the element drops pointer capture, so pointers the renderer still
    // sees as down are cancelled first.
    this.cancelForwarded();
    wrap.appendChild(this.element);
    this.holder = wrap;
    const claim = this.claims.get(wrap);
    if (!claim) return;
    this.applyInteractive(claim);
    this.sendSize(wrap);
    this.sendProps(claim);
    this.sendVisible(claim);
  }

  private applyInteractive(claim: CanvasClaim): void {
    this.canvas.style.pointerEvents = claim.interactive ? 'auto' : 'none';
    this.canvas.style.touchAction = claim.interactive ? 'none' : '';
  }

  /** Re-sends the size when the device pixel ratio changes at an unchanged CSS size. */
  private watchResolution(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let stop: (() => void) | null = null;
    const arm = () => {
      const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        if (this.holder) this.sendSize(this.holder);
        arm();
      };
      mql.addEventListener?.('change', onChange, { once: true });
      stop = () => mql.removeEventListener?.('change', onChange);
    };
    arm();
    this.stopResolutionWatch = () => stop?.();
  }

  private cancelForwarded(): void {
    for (const [pointerId, p] of this.forwarded) {
      this.send({ type: 'pointer', event: { type: 'cancel', pointerId, pointerType: p.pointerType, x: p.x, y: p.y, buttons: 0 } });
    }
    this.forwarded.clear();
  }

  private currentSize(wrap: HTMLElement): RendererSize | null {
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height, pixelRatio: cappedPixelRatio() };
  }

  private send(message: HostToRenderer, transfer?: Transferable[]): void {
    if (!this.worker || !this.booted) return;
    this.worker.postMessage(message, transfer ?? []);
  }

  private sendSize(wrap: HTMLElement): void {
    const size = this.currentSize(wrap);
    if (!size) return;
    const last = this.lastSize;
    if (last && last.width === size.width && last.height === size.height && last.pixelRatio === size.pixelRatio) return;
    this.lastSize = size;
    this.send({ type: 'resize', size });
  }

  private sendProps(claim: CanvasClaim): void {
    const json = JSON.stringify(claim.props);
    if (json === this.lastPropsJson) return;
    this.lastPropsJson = json;
    this.send({ type: 'props', props: claim.props });
  }

  private sendVisible(claim: CanvasClaim): void {
    if (claim.visible === this.lastVisible) return;
    this.lastVisible = claim.visible;
    this.send({ type: 'visible', visible: claim.visible });
  }

  private holderClaim(): CanvasClaim | null {
    return this.holder ? this.claims.get(this.holder) ?? null : null;
  }

  private async start(): Promise<void> {
    const generation = ++this.generation;
    const ref = normaliseAssetPath(this.spec.renderer);
    if (!ref || ref.query !== '') { this.fail('invalid renderer path'); return; }
    let blob: Blob | null = null;
    try { blob = await fetchBundleFile(this.spec.appId, ref.path, this.spec.version); } catch { blob = null; }
    if (this.disposed || generation !== this.generation) return;
    if (!blob) { this.fail('renderer module could not be fetched'); return; }
    this.rendererUrl = URL.createObjectURL(new Blob([blob], { type: 'text/javascript' }));
    const source = composeRendererWorkerSource(this.rendererUrl);
    const bootUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    this.bootUrl = bootUrl;
    let worker: Worker;
    try {
      worker = new Worker(bootUrl, { type: 'module', name: `canvas:${this.spec.appId}` });
    } catch (e) {
      this.fail(e);
      return;
    }
    this.worker = worker;
    this.booted = false;
    worker.addEventListener('message', (ev: MessageEvent) => this.onWorkerMessage(worker, ev.data as RendererToHost));
    worker.addEventListener('error', (ev) => {
      if (worker !== this.worker) return;
      console.error(`[canvas:${this.spec.appId}] worker error`, ev.message);
      // A live renderer that already used its respawn keeps running past a stray fault.
      if (this.phase === 'ready' && this.respawns >= MAX_RESPAWNS) return;
      this.workerFailed();
    });
    this.bootTimer = setTimeout(() => {
      if (worker === this.worker && !this.booted) this.workerFailed();
    }, BOOT_TIMEOUT_MS);
  }

  private onWorkerMessage(worker: Worker, m: RendererToHost): void {
    if (worker !== this.worker || !m || typeof m !== 'object') return;
    switch (m.type) {
      case 'booted': {
        if (this.booted) return;
        this.booted = true;
        this.revokeUrls();
        if (this.bootTimer) { clearTimeout(this.bootTimer); this.bootTimer = null; }
        this.init(worker);
        return;
      }
      case 'ready':
        this.setPhase('ready');
        return;
      case 'post':
        this.holderClaim()?.onMessage?.(m.data);
        return;
      case 'read-asset':
        void this.serveAsset(worker, m.id, m.path);
        return;
      case 'error':
        console.error(`[canvas:${this.spec.appId}] renderer error`, m.message);
        if (this.phase !== 'ready') this.workerFailed();
        return;
    }
  }

  private init(worker: Worker): void {
    let offscreen: OffscreenCanvas;
    try {
      offscreen = this.canvas.transferControlToOffscreen();
    } catch (e) {
      this.fail(e);
      return;
    }
    const claim = this.holderClaim();
    const size = (this.holder ? this.currentSize(this.holder) : null) ?? this.lastSize ?? { width: 1, height: 1, pixelRatio: cappedPixelRatio() };
    this.lastSize = size;
    this.lastPropsJson = JSON.stringify(claim?.props ?? {});
    this.lastVisible = claim?.visible ?? true;
    const init: HostToRenderer = {
      type: 'init', canvas: offscreen, size, props: claim?.props ?? {}, visible: this.lastVisible,
    };
    worker.postMessage(init, [offscreen]);
  }

  private async serveAsset(worker: Worker, id: number, path: string): Promise<void> {
    const reply = (m: HostToRenderer, transfer?: Transferable[]) => {
      if (worker === this.worker) worker.postMessage(m, transfer ?? []);
    };
    const ref = normaliseAssetPath(path);
    if (!ref) { reply({ type: 'asset-error', id, message: 'invalid asset path' }); return; }
    let blob: Blob | null = null;
    try {
      blob = await fetchServiceBlob(`/apps-api/installed/${encodeURIComponent(this.spec.appId)}/asset/${ref.path}${ref.query}`);
    } catch { blob = null; }
    if (!blob) { reply({ type: 'asset-error', id, message: 'asset not found' }); return; }
    try {
      const data = await blob.arrayBuffer();
      reply({ type: 'asset-result', id, data }, [data]);
    } catch {
      reply({ type: 'asset-error', id, message: 'asset could not be read' });
    }
  }

  private teardownWorker(): void {
    this.generation++;
    if (this.bootTimer) { clearTimeout(this.bootTimer); this.bootTimer = null; }
    const worker = this.worker;
    this.worker = null;
    this.booted = false;
    try { worker?.terminate(); } catch { /* already gone */ }
    this.revokeUrls();
  }

  /** Both blob URLs are spent once the worker has run its boot script and imported the module. */
  private revokeUrls(): void {
    if (this.rendererUrl) { URL.revokeObjectURL(this.rendererUrl); this.rendererUrl = null; }
    if (this.bootUrl) { URL.revokeObjectURL(this.bootUrl); this.bootUrl = null; }
  }

  /** One respawn on a worker fault, then the error state. */
  private workerFailed(): void {
    this.teardownWorker();
    if (this.disposed) return;
    if (this.respawns >= MAX_RESPAWNS) { this.fail('renderer worker failed'); return; }
    this.respawns++;
    // transferControlToOffscreen is one-shot per canvas element.
    const next = this.newCanvas();
    this.canvas.replaceWith(next);
    this.canvas = next;
    const claim = this.holderClaim();
    if (claim) this.applyInteractive(claim);
    this.lastSize = null;
    this.lastPropsJson = '';
    this.setPhase('loading');
    void this.start();
  }

  private fail(reason: unknown): void {
    console.error(`[canvas:${this.spec.appId}] renderer failed`, reason);
    this.teardownWorker();
    this.setPhase('error');
  }

  private pointerAllowed(): CanvasClaim | null {
    const claim = this.holderClaim();
    if (!claim || !claim.interactive || this.phase !== 'ready') return null;
    return claim;
  }

  private layerGestureLive(): boolean {
    return this.element.closest(`[${LAYER_GESTURE_ATTR}]`) !== null;
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    // A scaled panel draws the canvas smaller or larger than its layout box.
    const sx = rect.width > 0 && this.canvas.clientWidth > 0 ? this.canvas.clientWidth / rect.width : 1;
    const sy = rect.height > 0 && this.canvas.clientHeight > 0 ? this.canvas.clientHeight / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private readonly onLostCapture = (e: PointerEvent): void => {
    const p = this.forwarded.get(e.pointerId);
    if (!p) return;
    this.forwarded.delete(e.pointerId);
    this.send({ type: 'pointer', event: { type: 'cancel', pointerId: e.pointerId, pointerType: p.pointerType, x: p.x, y: p.y, buttons: 0 } });
  };

  private readonly onPointer = (e: PointerEvent): void => {
    const type = e.type.slice('pointer'.length) as CanvasPointerEvent['type'];
    const tracked = this.forwarded.has(e.pointerId);
    const wasWithheld = this.withheld.has(e.pointerId);
    if (wasWithheld && (type === 'up' || type === 'cancel')) this.withheld.delete(e.pointerId);
    // A pointer whose down reached the renderer always gets the rest of its
    // events, whatever the gates say now, so the renderer never keeps a stuck pointer.
    if (!tracked) {
      if (wasWithheld || !this.pointerAllowed()) return;
      if (this.layerGestureLive()) {
        if (type === 'down') this.withheld.add(e.pointerId);
        return;
      }
    }
    if (type === 'down') {
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
    const { x, y } = this.local(e);
    if (type === 'down') this.forwarded.set(e.pointerId, { pointerType: e.pointerType, x, y });
    else if (type === 'up' || type === 'cancel') this.forwarded.delete(e.pointerId);
    else if (tracked) this.forwarded.set(e.pointerId, { pointerType: e.pointerType, x, y });
    this.send({
      type: 'pointer',
      event: { type, pointerId: e.pointerId, pointerType: e.pointerType, x, y, buttons: e.buttons },
    });
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.pointerAllowed() || this.layerGestureLive()) return;
    e.preventDefault();
    const { x, y } = this.local(e);
    this.send({
      type: 'pointer',
      event: { type: 'wheel', pointerId: -1, pointerType: 'mouse', x, y, buttons: e.buttons, deltaY: e.deltaY, deltaMode: e.deltaMode },
    });
  };
}

interface CacheEntry {
  session: CanvasSession;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}
const sessions = new Map<string, CacheEntry>();

/** Cache key: shared mounts agree on `share`; an unshared mount passes its own id. */
export function canvasKey(spec: CanvasSpec, shareOrMount: string): string {
  return JSON.stringify([spec.appId, spec.version, spec.renderer, shareOrMount]);
}

export function acquireCanvas(key: string, spec: CanvasSpec, wrap: HTMLElement, claim: CanvasClaim): CanvasSession {
  let entry = sessions.get(key);
  if (entry) {
    if (entry.disposeTimer !== null) { clearTimeout(entry.disposeTimer); entry.disposeTimer = null; }
  } else {
    entry = { session: new CanvasSession(spec), disposeTimer: null };
    sessions.set(key, entry);
  }
  entry.session.claim(wrap, claim);
  return entry.session;
}

export function releaseCanvas(key: string, session: CanvasSession, wrap: HTMLElement): void {
  session.release(wrap);
  const entry = sessions.get(key);
  if (!entry || entry.session !== session || session.claimCount > 0) return;
  entry.disposeTimer = setTimeout(() => {
    if (sessions.get(key) === entry) sessions.delete(key);
    session.dispose();
  }, DISPOSE_GRACE_MS);
}
