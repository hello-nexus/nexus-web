import { useRef, type RefObject } from 'react';
import { useShaderRenderer } from '../../hooks/useShaderRenderer';
import type { EffectState } from '../../types/lighting';
import styles from '../site.module.scss';

/**
 * The app's real WebGL effect renderer pointed at the bundled plasma shader
 * (primed into the shader cache by site/main.tsx, so no service fetch).
 * Renders only while `active`; browsers without WebGL2 get a static gradient.
 */
export function PlasmaCanvas({ stateRef, active, maxDevicePixelRatio = 1.5, className }: {
  stateRef: RefObject<EffectState | null>;
  active: boolean;
  maxDevicePixelRatio?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useShaderRenderer(
    canvasRef, active ? 'plasma' : null, stateRef, undefined, { maxDevicePixelRatio });

  return (
    <div className={`${styles.plasmaWrap} ${className ?? ''}`}>
      <canvas ref={canvasRef} className={styles.plasmaCanvas} />
      {error && <div className={styles.plasmaFallback} />}
    </div>
  );
}
