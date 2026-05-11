const CHANNEL_NAME = 'panel-layout';

/**
 * Notify all panel consumers (kiosk, editor preview, other tabs) that the
 * layout has changed. Each consumer's usePanelLayout will re-fetch
 * /preferences and re-render.
 */
export function broadcastLayoutChanged(): void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'layout-changed' });
    ch.close();
  } catch {
    // BroadcastChannel not supported (e.g. some WebView2 configs) - no-op.
    // Consumers will pick up the change on next poll or page refresh.
  }
}

/**
 * Subscribe to layout-changed events from other tabs/windows.
 * Returns an unsubscribe function. Call in useEffect cleanup.
 */
export function onLayoutChanged(cb: () => void): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (e) => {
      if (e.data?.type === 'layout-changed') cb();
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}
