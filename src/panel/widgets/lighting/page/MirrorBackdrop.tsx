import { useEffect, useRef, useState } from 'react';
import { screenPreviewUrl } from '../../../../api/lighting';
import { isTunnelActive } from '../../../../api/service';
import { parseFrame } from '../../../../hooks/useLightingFrames';
import { paintLedFrame } from '../../../../lib/ledFrame';
import styles from '../LightingPage.module.scss';

const RECONNECT_MS = 2000;
/** Service close code: no capture source exists (no helper connected, or an unsupported platform). */
const UNAVAILABLE_CLOSE_CODE = 4503;

const isHidden = () => document.visibilityState === 'hidden';

/**
 * The Mirror tab's canvas when it is open while another mode runs globally: the output
 * stream shows the global mode, so this paints the live capture of the selected monitor
 * from the service preview stream. With Mirror global the output stream already is the
 * capture, so the caller does not mount this. The socket (and so the service capture)
 * exists only while this is mounted and the page is visible; frames paint straight to the
 * canvas and never touch the device frame store. When the service reports no capture source,
 * this renders nothing, so the output stream shows as it did before.
 */
export function MirrorBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    // A sealed tunnel would carry this unsealed, token-in-URL stream.
    if (isTunnelActive()) return undefined;
    // Black until the first capture frame, so the global mode's animation never shows through.
    if (canvasRef.current) paintLedFrame(canvasRef.current, null, 0, 0);
    let disposed = false;
    let gone = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const close = () => {
      if (retry !== null) { clearTimeout(retry); retry = null; }
      const s = socket;
      socket = null;
      if (s) { s.onclose = null; try { s.close(); } catch { /* already closed */ } }
    };

    const connect = async () => {
      if (disposed || gone || socket || isHidden()) return;
      const url = await screenPreviewUrl();
      if (disposed || socket || isHidden()) return;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const f = parseFrame(new Uint8Array(event.data));
        const el = canvasRef.current;
        if (el && f.canvasPixels) paintLedFrame(el, f.canvasPixels, f.canvasW, f.canvasH);
      };
      ws.onclose = (event) => {
        if (socket === ws) socket = null;
        if (disposed) return;
        if (event.code === UNAVAILABLE_CLOSE_CODE) { gone = true; setUnavailable(true); return; }
        retry = setTimeout(() => { retry = null; void connect(); }, RECONNECT_MS);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
      socket = ws;
    };

    const onVisibility = () => {
      if (isHidden()) close();
      else void connect();
    };

    document.addEventListener('visibilitychange', onVisibility);
    void connect();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      close();
    };
  }, []);

  if (unavailable) return null;
  return <canvas ref={canvasRef} className={styles.mirrorBackdrop} aria-hidden="true" />;
}
