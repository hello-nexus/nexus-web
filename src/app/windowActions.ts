// Window-action sentinels exchanged between the React dashboard and the
// Qos Windows shell (qos-overlay's DashboardWindow.cs). The shell parses
// the message string and calls the matching Win32 SW_* / WM_CLOSE - this
// file is the single source of truth for both ends; keep it in lockstep
// with HandleWindowAction in qos-overlay/src/DashboardWindow.cs.

export const QOS_WINDOW_ACTIONS = {
  minimize: 'qos:window-minimize',
  toggleMaximize: 'qos:window-toggle-maximize',
  close: 'qos:window-close',
} as const;

export type QosWindowAction = (typeof QOS_WINDOW_ACTIONS)[keyof typeof QOS_WINDOW_ACTIONS];

// Resize edges. The shell maps each value to the matching HTLEFT /
// HTRIGHT / HTTOP / HTBOTTOM / corner code and posts WM_NCLBUTTONDOWN
// so the OS native resize loop takes over. Keep in lockstep with the
// switch in HandleWindowAction in qos-overlay/src/DashboardWindow.cs.
export const QOS_RESIZE_EDGES = {
  left: 'qos:resize-left',
  right: 'qos:resize-right',
  top: 'qos:resize-top',
  bottom: 'qos:resize-bottom',
  topLeft: 'qos:resize-top-left',
  topRight: 'qos:resize-top-right',
  bottomLeft: 'qos:resize-bottom-left',
  bottomRight: 'qos:resize-bottom-right',
} as const;

export type QosResizeEdge = (typeof QOS_RESIZE_EDGES)[keyof typeof QOS_RESIZE_EDGES];

interface QosShellWebView {
  postMessage?: (msg: unknown) => void;
}

/**
 * True only inside the Qos Windows --app shell (qos-overlay's WebView2).
 * The shell injects `window.qosShellPlatform = 'windows-app'` via
 * AddScriptToExecuteOnDocumentCreated, so this returns false in the browser
 * or in non-Windows shells.
 */
export function isWindowsAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  const platform = (window as Window & { qosShellPlatform?: string }).qosShellPlatform;
  return platform === 'windows-app';
}

export function postWindowAction(action: QosWindowAction): void {
  const wv = (window as Window & { chrome?: { webview?: QosShellWebView } }).chrome?.webview;
  // postMessage's argument shape varies by host; the shell expects a plain
  // string sentinel. JSON.stringify would defeat WebMsgArgs_TryGetWebMessageAsString
  // on the C# side, so pass the raw string.
  wv?.postMessage?.(action);
}

export function postResizeStart(edge: QosResizeEdge): void {
  const wv = (window as Window & { chrome?: { webview?: QosShellWebView } }).chrome?.webview;
  wv?.postMessage?.(edge);
}
