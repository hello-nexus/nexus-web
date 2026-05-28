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
