import { useEffect, useRef } from 'react';
import { useLightingFrames } from '../../../hooks/useLightingFrames';
import { paintLedFrame } from '../../../lib/ledFrame';
import { isRelayActive } from '../../../api/service';
import styles from './LightingWidget.module.scss';

/**
 * Live preview of the real lighting output — the same GPU-rendered effect /
 * media / mirror stream the main lighting window paints (useLightingFrames).
 * Skipped on relay connections: the binary output stream is too much bandwidth
 * to forward, so the hook stays empty, this renders nothing, and the caller's
 * static thumbnail shows instead.
 */
export function LightingLivePreview() {
  const frames = useLightingFrames(!isRelayActive());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (el) paintLedFrame(el, frames.canvasPixels, frames.canvasW, frames.canvasH);
  }, [frames.canvasPixels, frames.canvasW, frames.canvasH]);

  const hasLive = frames.connected && !!frames.canvasPixels && frames.canvasW > 0;
  if (!hasLive) return null;
  return <canvas ref={canvasRef} className={styles.livePreview} aria-hidden="true" />;
}
