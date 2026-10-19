import { useEffect, useRef, useState } from 'react';
import { screenPreviewUrl } from '../../../api/lighting';
import { isTunnelActive } from '../../../api/service';
import { parseFrame } from '../../../hooks/useLightingFrames';
import { paintLedFrame } from '../../../lib/ledFrame';

const RECONNECT_MS = 2000;
/** Service close code: no capture source exists (no helper connected, or an unsupported platform). */
const UNAVAILABLE_CLOSE_CODE = 4503;

const isHidden = () => document.visibilityState === 'hidden';

/**
 * A canvas showing the live capture of the selected mirror monitor from the service
 * preview stream. The socket (and so the service capture) exists only while this is mounted
 * and the page is visible; frames paint straight to the canvas and never touch the device
 * frame store. When the service reports no capture source, this renders nothing and calls
 * onUnavailable.
 */
export function ScreenPreviewCanvas({ className, onSize, onUnavailable }: {
  className?: string;
  /** The capture frame's size, for laying a region over it. */
  onSize?: (width: number, height: number) => void;
  onUnavailable?: () => void;
}) {
  const sizeRef = useRef(onSize);
  const unavailableRef = useRef(onUnavailable);
  useEffect(() => {
    sizeRef.current = onSize;
    unavailableRef.current = onUnavailable;
  });
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
        if (el && f.canvasPixels) {
          paintLedFrame(el, f.canvasPixels, f.canvasW, f.canvasH);
          sizeRef.current?.(f.canvasW, f.canvasH);
        }
      };
      ws.onclose = (event) => {
        if (socket === ws) socket = null;
        if (disposed) return;
        if (event.code === UNAVAILABLE_CLOSE_CODE) { gone = true; setUnavailable(true); unavailableRef.current?.(); return; }
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
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
