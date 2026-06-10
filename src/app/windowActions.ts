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
