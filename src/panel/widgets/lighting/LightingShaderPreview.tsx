import { useEffect, useRef } from 'react';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import type { EffectState } from '../../../types/lighting';
import styles from './LightingWidget.module.scss';

/**
 * Full-resolution on-device render of the active Animate effect — the same
 * WebGL shader system the fullscreen editor and the background-effect preview
 * use (useShaderRenderer). Replaces the low-res streamed LED canvas
 * (LightingLivePreview) for shader effects in the immersive preview, so the
 * effect reads sharp instead of upscaled-from-LED-grid blocky. Audio uniforms
 * are left at 0 (no live audio wired here), so audio-reactive effects animate
 * but do not pulse to sound in this preview.
 */
export function LightingShaderPreview({ effect, state }: { effect: string; state: EffectState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const { ready, error } = useShaderRenderer(canvasRef, effect, stateRef);

  return (
    <canvas
      ref={canvasRef}
      className={styles.shaderPreview}
      data-ready={ready && !error ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
