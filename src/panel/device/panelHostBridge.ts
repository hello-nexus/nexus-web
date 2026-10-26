// Panel to kiosk-host messages: WebView2 takes objects, the WKWebView `nexusPanel` handler takes a JSON string.

export interface HitRect { x: number; y: number; w: number; h: number }

export type PanelHostMessage =
  // CSS px. `region`: only these rects take input; `full`: the whole window does.
  // `lease`: a transient full that the host drops unless it is renewed.
  | { type: 'nexus.panel.hitTest'; mode: 'region' | 'full'; dpr: number; rects: HitRect[]; lease?: boolean }
  | { type: 'nexus.panel.raise'; value: boolean };

interface HostPoster {
  postMessage(payload: unknown): void;
  addEventListener?(type: 'message', listener: (event: Event) => void): void;
  removeEventListener?(type: 'message', listener: (event: Event) => void): void;
}

// Cast at the call site: other surfaces declare their own webkit.messageHandlers shape.
interface PanelBridgeWindow {
  chrome?: { webview?: HostPoster };
  webkit?: { messageHandlers?: { nexusPanel?: HostPoster } };
}

function hostPoster(): { post: (msg: PanelHostMessage) => void } | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as PanelBridgeWindow;
  const win = w.chrome?.webview;
  if (win) return { post: msg => win.postMessage(msg) };
  const mac = w.webkit?.messageHandlers?.nexusPanel;
  if (mac) return { post: msg => mac.postMessage(JSON.stringify(msg)) };
  return null;
}

/** True when a kiosk host is listening; a browser tab has none. */
export function panelHostAvailable(): boolean {
  return hostPoster() !== null;
}

export function postPanelHostMessage(msg: PanelHostMessage): void {
  hostPoster()?.post(msg);
}

interface Measurable { getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } }

/** On-screen boxes of `elements` as whole CSS px clipped to the viewport; a paged-out widget adds nothing. */
export function collectHitRects(
  elements: Iterable<Measurable>,
  viewport: { width: number; height: number },
): HitRect[] {
  const rects: HitRect[] = [];
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    const left = Math.max(0, Math.floor(r.left));
    const top = Math.max(0, Math.floor(r.top));
    const right = Math.min(viewport.width, Math.ceil(r.right));
    const bottom = Math.min(viewport.height, Math.ceil(r.bottom));
    if (right <= left || bottom <= top) continue;
    rects.push({ x: left, y: top, w: right - left, h: bottom - top });
  }
  return rects;
}

/** What the host should be told for the panel's current state. */
export function hitTestMessage(
  full: boolean,
  rects: HitRect[],
  dpr: number,
  lease = false,
): Extract<PanelHostMessage, { type: 'nexus.panel.hitTest' }> {
  if (!full) return { type: 'nexus.panel.hitTest', mode: 'region', dpr, rects };
  return { type: 'nexus.panel.hitTest', mode: 'full', ...(lease ? { lease: true } : {}), dpr, rects: [] };
}

export const REQUEST_HIT_TEST = 'nexus.panel.requestHitTest';
export const ORIGIN_MESSAGE = 'nexus.panel.origin';

/** Where the kiosk window sits in the monitor's full frame, CSS px; the full size is present when the host sends it. */
export interface KioskOrigin { originX: number; originY: number; fullW?: number; fullH?: number }

interface HostHook {
  requestHitTest(): void;
  setOrigin(origin: KioskOrigin): void;
}
type HostWindow = PanelBridgeWindow & { __nexusPanelHost?: HostHook };

const requestSubscribers = new Set<() => void>();
const originSubscribers = new Set<(origin: KioskOrigin) => void>();
let detach: (() => void) | null = null;

function fireRequest(): void {
  for (const cb of [...requestSubscribers]) cb();
}

function fireOrigin(origin: KioskOrigin): void {
  for (const cb of [...originSubscribers]) cb(origin);
}

function parsed(data: unknown): { type?: unknown; [key: string]: unknown } | null {
  if (typeof data === 'string') {
    try { return JSON.parse(data) as { type?: unknown } | null; } catch { return null; }
  }
  return typeof data === 'object' && data !== null ? data as { type?: unknown } : null;
}

const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function originOf(msg: Record<string, unknown>): KioskOrigin {
  return { originX: finite(msg.originX) ?? 0, originY: finite(msg.originY) ?? 0, fullW: finite(msg.fullW), fullH: finite(msg.fullH) };
}

function onMessage(event: Event): void {
  const msg = parsed((event as MessageEvent).data);
  if (msg?.type === REQUEST_HIT_TEST) fireRequest();
  else if (msg?.type === ORIGIN_MESSAGE) fireOrigin(originOf(msg));
}

// One hook and one listener pair serve every subscriber; the last unsubscribe removes them.
function subscribe<T>(set: Set<T>, cb: T): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as unknown as HostWindow;
  if (requestSubscribers.size + originSubscribers.size === 0) {
    w.__nexusPanelHost = { requestHitTest: fireRequest, setOrigin: fireOrigin };
    w.chrome?.webview?.addEventListener?.('message', onMessage);
    window.addEventListener('message', onMessage);
    detach = () => {
      w.chrome?.webview?.removeEventListener?.('message', onMessage);
      window.removeEventListener('message', onMessage);
      delete w.__nexusPanelHost;
    };
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (requestSubscribers.size + originSubscribers.size === 0) detach?.();
  };
}

/** Runs `cb` when the host asks for a re-report: macOS calls `__nexusPanelHost.requestHitTest()`, Windows posts a message. */
export function onHostRequestHitTest(cb: () => void): () => void {
  return subscribe(requestSubscribers, cb);
}

/** Runs `cb` when the host refits the kiosk and reports its new origin: macOS calls `__nexusPanelHost.setOrigin(...)`, Windows posts a message. */
export function onHostOrigin(cb: (origin: KioskOrigin) => void): () => void {
  return subscribe(originSubscribers, cb);
}
