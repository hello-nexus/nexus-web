// Messages from a display-bound panel to the kiosk host that owns its window.
// The Windows host is a WebView2 (`window.chrome.webview`, structured payloads);
// the macOS host is a WKWebView whose `nexusPanel` script handler receives the
// body verbatim, so the payload is stringified for it.

export interface HitRect { x: number; y: number; w: number; h: number }

export type PanelHostMessage =
  // CSS px. `region`: only these rects take input and the rest of the window
  // passes through. `full`: the whole window takes input (a sheet, drag or
  // immersive view is open).
  | { type: 'nexus.panel.hitTest'; mode: 'region' | 'full'; dpr: number; rects: HitRect[] }
  // Lift a not-on-top window above other windows while a menu, sheet or drag is open.
  | { type: 'nexus.panel.raise'; value: boolean };

interface HostPoster { postMessage(payload: unknown): void }

// Cast at the call site: other surfaces attach their own narrow
// webkit.messageHandlers shapes, so a global Window augmentation would clash.
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

/**
 * The rects of `elements` that are on screen, as rounded CSS-px boxes clipped to
 * the viewport. An element scrolled or paged out of view, or collapsed, adds
 * nothing, so a widget on another page never carves input out of the desktop.
 */
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
): Extract<PanelHostMessage, { type: 'nexus.panel.hitTest' }> {
  return { type: 'nexus.panel.hitTest', mode: full ? 'full' : 'region', dpr, rects: full ? [] : rects };
}
