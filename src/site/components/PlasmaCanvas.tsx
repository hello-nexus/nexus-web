import { useRef, type RefObject } from 'react';
import { useShaderRenderer } from '../../hooks/useShaderRenderer';
import type { EffectState } from '../../types/lighting';
import type { AudioSnapshot } from '../../hooks/useAudioState';
import styles from '../site.module.scss';

/**
 * The app's real WebGL effect renderer pointed at a bundled shader (primed
 * into the shader cache by site/main.tsx, so no service fetch). Renders only
 * while `active`; browsers without WebGL2 get a static gradient. `audioRef`
 * feeds audio-reactive effects (the demo passes a synthetic beat).
 */
export function PlasmaCanvas({ stateRef, active, effect = 'plasma', audioRef, maxDevicePixelRatio = 1.5, className }: {
  stateRef: RefObject<EffectState | null>;
  active: boolean;
  effect?: string;
  audioRef?: RefObject<AudioSnapshot | null>;
  maxDevicePixelRatio?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useShaderRenderer(
    canvasRef, active ? effect : null, stateRef, audioRef, { maxDevicePixelRatio });

  return (
    <div className={`${styles.plasmaWrap} ${className ?? ''}`}>
      <canvas ref={canvasRef} className={styles.plasmaCanvas} />
      {error && <div className={styles.plasmaFallback} />}
    </div>
  );
}
