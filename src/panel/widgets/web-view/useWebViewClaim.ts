import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { webViewHost, type WebViewHostSnapshot } from '../../webview/webViewHost';

/**
 * Registers the returned element as the rect of this widget's native view.
 * `ref` goes on the placeholder; with `enabled` false nothing is registered
 * and the host is never touched.
 */
export function useWebViewClaim(opts: { id: string; url: string | null; immersive: boolean; enabled: boolean; zoom: number; refreshMinutes: number }) {
  const { id, url, immersive, enabled, zoom, refreshMinutes } = opts;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const snapshot: WebViewHostSnapshot = useSyncExternalStore(webViewHost.subscribe, webViewHost.getSnapshot);
  const urlRef = useRef(url);
  urlRef.current = url;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const refreshRef = useRef(refreshMinutes);
  refreshRef.current = refreshMinutes;
  const handleRef = useRef<ReturnType<typeof webViewHost.register> | null>(null);

  useEffect(() => {
    if (!enabled || !element || !urlRef.current) return;
    const handle = webViewHost.register({ id, url: urlRef.current, element, immersive, zoom: zoomRef.current, refreshMinutes: immersive ? 0 : refreshRef.current });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.release();
    };
  }, [enabled, element, id, immersive]);

  useEffect(() => {
    if (url) handleRef.current?.setUrl(url);
  }, [url]);

  useEffect(() => {
    handleRef.current?.setZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    handleRef.current?.setRefreshMinutes(immersive ? 0 : refreshMinutes);
  }, [refreshMinutes, immersive]);

  return { ref: setElement, snapshot };
}
