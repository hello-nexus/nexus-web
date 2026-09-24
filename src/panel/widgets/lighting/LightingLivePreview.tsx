import { useEffect, useRef } from 'react';
import { useLightingFrames } from '../../../hooks/useLightingFrames';
import { paintLedFrame } from '../../../lib/ledFrame';
import { subscribeLedFrame } from '../../../lib/ledFrameStore';
import { isTunnelActive } from '../../../api/service';
import styles from './LightingWidget.module.scss';

/**
 * Live preview of the real lighting output - the same GPU-rendered effect /
 * media / mirror stream the main lighting window paints (useLightingFrames).
 * Skipped on any sealed tunnel (cloud relay OR the LAN sealed tunnel): the
 * binary /lighting/output stream is unsealed and token-in-URL, so forwarding it
 * would both cost bandwidth and leak the token - the hook stays empty, this
 * renders nothing, and the caller's static thumbnail shows instead.
 */
export function LightingLivePreview() {
  const { live } = useLightingFrames(!isTunnelActive());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!live) return undefined;
    return subscribeLedFrame(f => {
      const el = canvasRef.current;
      if (el) paintLedFrame(el, f.pixels, f.w, f.h);
    });
  }, [live]);

  if (!live) return null;
  return <canvas ref={canvasRef} className={styles.livePreview} aria-hidden="true" />;
}
