import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useShaderRenderer } from '../../hooks/useShaderRenderer';
import type { EffectState } from '../../types/lighting';
import type { PanelSurface } from '../types';
import {
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
} from './panelBackground';
import styles from '../PanelApp.module.scss';

interface PanelBackgroundShaderProps {
  effect: string;
  template: number;
  opacity: number;
  // The universal preset's render state (resolved upstream from the global
  // Templates for the selected slot). Undefined falls back to the built-in
  // default before that has hydrated.
  effectState?: EffectState;
  surface?: PanelSurface;
}

export function PanelBackgroundShader({ effect, template, opacity, effectState, surface }: PanelBackgroundShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const normalizedEffect = normalizePanelBackgroundEffect(effect);
  const normalizedTemplate = normalizePanelBackgroundTemplate(template);
  // The render loop reads stateRef.current each frame, so an effect push is
  // picked up next frame. Initialize with the same normalized inputs so the
  // first frame doesn't render stale state.
  const stateRef = useRef(effectState ?? panelBackgroundState(normalizedEffect, normalizedTemplate));
  useEffect(() => {
    stateRef.current = effectState ?? panelBackgroundState(normalizedEffect, normalizedTemplate);
  }, [normalizedEffect, normalizedTemplate, effectState]);
  // The Q-series AIO panel renders the background shader at half resolution:
  // its GPU can't hold frame rate on heavy shaders at full res, and the small
  // panel hides the resolution drop. Other surfaces render at native. NOTE:
  // 'q60' is the single surface for the whole Q-series -- the Q60 and Q80 are
  // the same 720x1280 LCD and both infer to 'q60' (there is no 'q80' surface),
  // so this gate covers both.
  const renderOptions = useMemo(() => (
    { maxDevicePixelRatio: surface === 'q60' ? 0.5 : 1 }
  ), [surface]);
  const { ready, error } = useShaderRenderer(
    canvasRef,
    normalizedEffect,
    stateRef,
    undefined,
    renderOptions,
  );
  const style = {
    '--panel-background-opacity': normalizePanelBackgroundOpacity(opacity),
  } as CSSProperties;

  return (
    <div
      className={styles.backgroundShader}
      data-ready={ready && !error ? 'true' : 'false'}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.backgroundShaderCanvas} />
    </div>
  );
}
