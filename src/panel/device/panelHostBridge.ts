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

interface HostHook { requestHitTest(): void }
type HostWindow = PanelBridgeWindow & { __nexusPanelHost?: HostHook };

const requestSubscribers = new Set<() => void>();
let detach: (() => void) | null = null;

function fireRequest(): void {
  for (const cb of [...requestSubscribers]) cb();
}

function isRequestMessage(data: unknown): boolean {
  if (typeof data === 'string') {
    try { return (JSON.parse(data) as { type?: unknown } | null)?.type === REQUEST_HIT_TEST; } catch { return false; }
  }
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === REQUEST_HIT_TEST;
}

/** Runs `cb` when the host asks for a re-report: macOS calls `__nexusPanelHost.requestHitTest()`, Windows posts a message. */
export function onHostRequestHitTest(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as unknown as HostWindow;
  const first = requestSubscribers.size === 0;
  requestSubscribers.add(cb);
  const onMessage = (event: Event) => { if (isRequestMessage((event as MessageEvent).data)) fireRequest(); };
  if (first) {
    w.__nexusPanelHost = { requestHitTest: fireRequest };
    w.chrome?.webview?.addEventListener?.('message', onMessage);
    window.addEventListener('message', onMessage);
    detach = () => {
      w.chrome?.webview?.removeEventListener?.('message', onMessage);
      window.removeEventListener('message', onMessage);
      delete w.__nexusPanelHost;
    };
  }
  return () => {
    requestSubscribers.delete(cb);
    if (requestSubscribers.size === 0) detach?.();
  };
}
