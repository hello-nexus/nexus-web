// Cross-platform bridge between OverlayShell and the native widget host.
// The Windows host is qos-overlay.exe (WebView2): listens via
// `window.chrome.webview`. The macOS host is qos-service itself
// (in-process WKWebView + AppKit): listens via
// `window.webkit.messageHandlers.qosOverlay`.
//
// WebView2 accepts structured payloads (postMessage takes any object).
// WKWebView's WKScriptMessageHandler receives the body verbatim - we
// stringify on send so the host always parses JSON regardless of platform,
// matching the AppKit-side decode in MacOverlayHost.DidReceiveScriptMessage.

type WidgetRect = { id: string; x: number; y: number; w: number; h: number };
type PopoverRect = { x: number; y: number; w: number; h: number };

export type HostMessage =
  | { type: 'reportLayout'; widgets: WidgetRect[]; popover?: PopoverRect }
  | { type: 'setAlwaysOnTop'; value: boolean };

interface WebView2Bridge { postMessage(payload: unknown): void }
interface WKMessageHandler { postMessage(payload: unknown): void }

// Cast at the call site rather than augmenting the global Window: other
// surfaces (PanelApp's NativeSettingsWindow) attach their own narrow
// webkit.messageHandlers shapes, and a global declaration here would force
// an incompatible-extend error on those locally-typed Window subtypes.
interface OverlayBridgeWindow {
  chrome?: { webview?: WebView2Bridge };
  webkit?: { messageHandlers?: { qosOverlay?: WKMessageHandler } };
}

export function postToHost(msg: HostMessage): void {
  const w = window as unknown as OverlayBridgeWindow;
  const win = w.chrome?.webview;
  if (win) {
    win.postMessage(msg);
    return;
  }
  const mac = w.webkit?.messageHandlers?.qosOverlay;
  if (mac) {
    mac.postMessage(JSON.stringify(msg));
    return;
  }
  // No host attached. Happens when the /overlay route is loaded from a
  // normal browser tab during dev - the tab can't carve regions or change
  // z-order, but the SPA still renders so visual iteration works.
}
