// Window-action sentinels exchanged between the React dashboard and the
// Nexus Windows shell (nexus-overlay's DashboardWindow.cs). The shell parses
// the message string and calls the matching Win32 SW_* / WM_CLOSE - this
// file is the single source of truth for both ends; keep it in lockstep
// with HandleWindowAction in nexus-overlay/src/DashboardWindow.cs.

export const NEXUS_WINDOW_ACTIONS = {
  minimize: 'nexus:window-minimize',
  toggleMaximize: 'nexus:window-toggle-maximize',
  close: 'nexus:window-close',
} as const;

export type NexusWindowAction = (typeof NEXUS_WINDOW_ACTIONS)[keyof typeof NEXUS_WINDOW_ACTIONS];

// Resize edges. The shell maps each value to the matching HTLEFT /
// HTRIGHT / HTTOP / HTBOTTOM / corner code and posts WM_NCLBUTTONDOWN
// so the OS native resize loop takes over. Keep in lockstep with the
// switch in HandleWindowAction in nexus-overlay/src/DashboardWindow.cs.
export const NEXUS_RESIZE_EDGES = {
  left: 'nexus:resize-left',
  right: 'nexus:resize-right',
  top: 'nexus:resize-top',
  bottom: 'nexus:resize-bottom',
  topLeft: 'nexus:resize-top-left',
  topRight: 'nexus:resize-top-right',
  bottomLeft: 'nexus:resize-bottom-left',
  bottomRight: 'nexus:resize-bottom-right',
} as const;

export type NexusResizeEdge = (typeof NEXUS_RESIZE_EDGES)[keyof typeof NEXUS_RESIZE_EDGES];

// Window-drag start. The shell posts WM_NCLBUTTONDOWN(HTCAPTION) so the OS move
// loop takes over (Aero Snap included) — the title-bar drag without an
// `app-region: drag` non-client region (which black-flickers on resize over the
// transparent Mica WebView2). Keep in lockstep with HandleWindowAction.
export const NEXUS_WINDOW_DRAG = 'nexus:window-drag';

interface NexusShellWebView {
  postMessage?: (msg: unknown) => void;
  postMessageWithAdditionalObjects?: (msg: unknown, objects: unknown) => void;
  addEventListener?: (type: 'message', cb: (e: { data?: unknown }) => void) => void;
  removeEventListener?: (type: 'message', cb: (e: { data?: unknown }) => void) => void;
}

// Gallery drag-n-drop bridge. The web sandbox hides dropped files' disk
// paths; inside the Windows shell the host reads them off the message's
// AdditionalObjects and replies with the real paths. Keep both sentinels in
// lockstep with HandleGalleryDrop in nexus-overlay/src/DashboardWindow.cs.
export const NEXUS_GALLERY_DROP = 'nexus:gallery-drop';
export const NEXUS_GALLERY_DROP_PATHS = 'nexus:gallery-drop-paths';

/**
 * Hand dropped files to the shell so it can resolve their disk paths.
 * Returns false when no path-capable shell bridge is present (plain
 * browser tabs) — the caller shows a "use the picker" hint instead.
 */
export function postGalleryDrop(files: File[]): boolean {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  if (!wv?.postMessageWithAdditionalObjects) return false;
  wv.postMessageWithAdditionalObjects(NEXUS_GALLERY_DROP, files);
  return true;
}

/** Subscribe to the shell's dropped-paths replies. Returns the unsubscribe. */
export function subscribeGalleryDropPaths(onPaths: (paths: string[]) => void): () => void {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  if (!wv?.addEventListener) return () => {};
  const listener = (e: { data?: unknown }) => {
    const data = e.data as { type?: string; paths?: unknown } | undefined;
    if (data?.type === NEXUS_GALLERY_DROP_PATHS && Array.isArray(data.paths)) {
      onPaths(data.paths.filter((p): p is string => typeof p === 'string'));
    }
  };
  wv.addEventListener('message', listener);
  return () => wv.removeEventListener?.('message', listener);
}

/**
 * True only inside the Nexus Windows --app shell (nexus-overlay's WebView2).
 * The shell injects `window.nexusShellPlatform = 'windows-app'` via
 * AddScriptToExecuteOnDocumentCreated, so this returns false in the browser
 * or in non-Windows shells.
 */
export function isWindowsAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  const platform = (window as Window & { nexusShellPlatform?: string }).nexusShellPlatform;
  return platform === 'windows-app';
}

/**
 * True only inside the Nexus macOS shell (MacAppWindow's WKWebView). The shell
 * injects `window.nexusShellPlatform = 'mac-app'` via a document-start
 * WKUserScript. The window uses a full-size content view with a transparent
 * title bar, so the layout insets its top chrome below the traffic lights.
 */
export function isMacAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  const platform = (window as Window & { nexusShellPlatform?: string }).nexusShellPlatform;
  return platform === 'mac-app';
}

/**
 * The 'glass' background paints the web transparent and relies on the native
 * shell's behind-window material (Windows Mica, macOS vibrancy). Only the
 * Windows/macOS app shells provide it — in a plain browser tab or the Linux
 * Chromium --app spawn there's no native blur, so glass silently shows the flat
 * base. Callers use this to hide glass where it can't render.
 */
export function hostSupportsGlass(): boolean {
  return isWindowsAppShell() || isMacAppShell();
}

export const NEXUS_SYSTEM_ACCENT = 'nexus:system-accent';
export const NEXUS_REQUEST_SYSTEM_ACCENT = 'nexus:request-system-accent';

/** Ask the host to push the OS accent colour. False if no host bridge. */
export function requestSystemAccent(): boolean {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  if (wv?.postMessage) { wv.postMessage(NEXUS_REQUEST_SYSTEM_ACCENT); return true; }
  // The macOS shell (WKWebView) has no chrome.webview; it exposes a
  // webkit.messageHandlers.nexusHost channel for web→host. Keep the "nexusHost"
  // name in lockstep with addScriptMessageHandler:name: in MacAppWindow.cs.
  const mac = (window as Window & { webkit?: { messageHandlers?: { nexusHost?: { postMessage?: (m: unknown) => void } } } })
    .webkit?.messageHandlers?.nexusHost;
  if (mac?.postMessage) { mac.postMessage(NEXUS_REQUEST_SYSTEM_ACCENT); return true; }
  return false;
}

/** Subscribe to OS accent colour updates (#RRGGBB). Returns the unsubscribe. */
export function subscribeSystemAccent(onAccent: (hex: string) => void): () => void {
  const handle = (data: unknown) => {
    const d = data as { type?: string; hex?: unknown } | undefined;
    if (d?.type === NEXUS_SYSTEM_ACCENT && typeof d.hex === 'string') onAccent(d.hex);
  };
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  if (wv?.addEventListener) {
    const listener = (e: { data?: unknown }) => handle(e.data);
    wv.addEventListener('message', listener);
    return () => wv.removeEventListener?.('message', listener);
  }
  // macOS shell: the host dispatches a window 'message' event with the accent.
  const listener = (e: MessageEvent) => handle(e.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Tell the native host the dashboard's resolved light/dark so it themes its own
 * native chrome — Windows DWM immersive mode + Mica, macOS NSWindow appearance
 * + vibrancy — instead of following the OS theme. No-op in a plain browser.
 * Keep the message strings in lockstep with the host handlers (DashboardWindow.cs
 * OnWebMessageReceived / MacAppWindow.cs DidReceiveScriptMessage).
 */
export function postResolvedTheme(dark: boolean): void {
  const msg = dark ? 'nexus:theme-dark' : 'nexus:theme-light';
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  if (wv?.postMessage) { wv.postMessage(msg); return; }
  const mac = (window as Window & { webkit?: { messageHandlers?: { nexusHost?: { postMessage?: (m: unknown) => void } } } })
    .webkit?.messageHandlers?.nexusHost;
  mac?.postMessage?.(msg);
}

export function postWindowAction(action: NexusWindowAction): void {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  // postMessage's argument shape varies by host; the shell expects a plain
  // string sentinel. JSON.stringify would defeat WebMsgArgs_TryGetWebMessageAsString
  // on the C# side, so pass the raw string.
  wv?.postMessage?.(action);
}

export function postResizeStart(edge: NexusResizeEdge): void {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  wv?.postMessage?.(edge);
}

export function postWindowDragStart(): void {
  const wv = (window as Window & { chrome?: { webview?: NexusShellWebView } }).chrome?.webview;
  wv?.postMessage?.(NEXUS_WINDOW_DRAG);
}
