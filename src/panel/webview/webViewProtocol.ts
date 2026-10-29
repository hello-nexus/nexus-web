// Wire contract between the panel page and the native web-view layer. Versioned
// by `version`; native hosts are built against the same message shapes.

export const WEBVIEW_PROTOCOL_VERSION = 1;
// No caps reply within this window after hello means the host has no native layer.
export const CAPS_TIMEOUT_MS = 1500;
// Heartbeat period: well inside the native watchdog window, which destroys every view when syncs stop.
export const HEARTBEAT_MS = 1000;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

export function clampZoom(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

export interface WebViewRect { x: number; y: number; w: number; h: number }

export interface WebViewSyncView {
  id: string;
  url: string;
  rect: WebViewRect;
  interactive: boolean;
  visible: boolean;
  /** Corner radius in CSS px of the visible card; absent or 0 means square. */
  radius?: number;
  /** Page zoom factor, clamped to the zoom range. Changing it never reloads the view. */
  zoom?: number;
  /** Set only for the immersive claim; the overlay hides its in-page back disc then. */
  immersive?: boolean;
}

export interface WebViewHello { type: 'nexus.webview.hello'; version: number }

export interface WebViewSync {
  type: 'nexus.webview.sync';
  seq: number;
  viewport: { w: number; h: number };
  views: WebViewSyncView[];
}

export type WebViewCommandName = 'back' | 'forward' | 'reload' | 'home';

export interface WebViewCommand {
  type: 'nexus.webview.command';
  id: string;
  command: WebViewCommandName;
}

export type WebViewOutbound = WebViewHello | WebViewSync | WebViewCommand;

export interface WebViewCaps {
  type: 'nexus.webview.caps';
  version: number;
  supported: boolean;
  maxViews: number;
  interactive: boolean;
  /** The host reports right-clicks on an interactive view, so a tile can take the mouse and keep its widget menu. */
  contextMenu: boolean;
  /** The host reports a touch long-press on an interactive view as a context-menu request. */
  longPress: boolean;
  /** The host draws a back disc in the page and understands the home command. */
  navControls: boolean;
}

export type WebViewLoadState = 'loading' | 'loaded' | 'error' | 'crashed';

export interface WebViewStateMessage {
  type: 'nexus.webview.state';
  id: string;
  state: WebViewLoadState;
  code?: string;
  canGoBack: boolean;
  canGoForward?: boolean;
  /** The view is away from its configured page. */
  away?: boolean;
}

/** A right-click on an interactive view, at a page CSS px point. */
export interface WebViewContextMenuMessage {
  type: 'nexus.webview.contextmenu';
  id: string;
  x: number;
  y: number;
}
export type WebViewInbound = WebViewCaps | WebViewStateMessage | WebViewContextMenuMessage;

export type WebViewTransportKind = 'webview2' | 'webkit' | 'android' | 'react-native';

export interface WebViewTransport {
  kind: WebViewTransportKind;
  post: (msg: WebViewOutbound) => void;
}

interface TransportWindow {
  chrome?: { webview?: { postMessage?: (m: unknown) => void } };
  webkit?: { messageHandlers?: { nexusWebView?: { postMessage?: (m: unknown) => void } } };
  NexusWebView?: { postMessage?: (m: string) => void };
  ReactNativeWebView?: { postMessage?: (m: string) => void };
}

// First match wins. Each host injects exactly one of these.
export function detectTransport(win: object = window): WebViewTransport | null {
  const w = win as TransportWindow;
  const wv2 = w.chrome?.webview;
  if (wv2 && typeof wv2.postMessage === 'function') {
    return { kind: 'webview2', post: m => wv2.postMessage!(m) };
  }
  const wk = w.webkit?.messageHandlers?.nexusWebView;
  if (wk && typeof wk.postMessage === 'function') {
    return { kind: 'webkit', post: m => wk.postMessage!(m) };
  }
  const android = w.NexusWebView;
  if (android && typeof android.postMessage === 'function') {
    return { kind: 'android', post: m => android.postMessage!(JSON.stringify(m)) };
  }
  const rn = w.ReactNativeWebView;
  if (rn && typeof rn.postMessage === 'function') {
    return { kind: 'react-native', post: m => rn.postMessage!(JSON.stringify(m)) };
  }
  return null;
}

// Accepts an object or a JSON string (a host may deliver either) and returns
// the typed message, or null for anything that is not a webview frame.
export function parseInbound(raw: unknown): WebViewInbound | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const m = obj as Record<string, unknown>;
  if (m.type === 'nexus.webview.caps') {
    return {
      type: 'nexus.webview.caps',
      version: typeof m.version === 'number' ? m.version : 1,
      supported: m.supported === true,
      maxViews: typeof m.maxViews === 'number' ? m.maxViews : 0,
      interactive: m.interactive === true,
      contextMenu: m.contextMenu === true,
      longPress: m.longPress === true,
      navControls: m.navControls === true,
    };
  }
  if (m.type === 'nexus.webview.contextmenu' && typeof m.id === 'string'
    && typeof m.x === 'number' && Number.isFinite(m.x) && typeof m.y === 'number' && Number.isFinite(m.y)) {
    return { type: 'nexus.webview.contextmenu', id: m.id, x: m.x, y: m.y };
  }
  if (m.type === 'nexus.webview.state' && typeof m.id === 'string') {
    const s = m.state;
    if (s !== 'loading' && s !== 'loaded' && s !== 'error' && s !== 'crashed') return null;
    return {
      type: 'nexus.webview.state',
      id: m.id,
      state: s,
      code: typeof m.code === 'string' ? m.code : undefined,
      canGoBack: m.canGoBack === true,
      canGoForward: m.canGoForward === true,
      away: m.away === true,
    };
  }
  return null;
}

// Only the panel runtime page can sit under a native host: the editor canvas
// iframe (simulator flag), the desktop dashboard and the device page preview
// never talk to one by design.
export function isLivePanelPage(loc: Pick<Location, 'pathname' | 'search'> = window.location): boolean {
  const path = loc.pathname;
  const panelPath = path === '/panel' || path === '/touch' || path.startsWith('/panel/');
  return panelPath && new URLSearchParams(loc.search).get('simulator') !== '1';
}
