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
  // Skip the q60 half-res cap: the dashboard simulator runs on the desktop GPU,
  // not the Q-series panel, so it renders the shader at native resolution.
  fullRes?: boolean;
}

export function PanelBackgroundShader({ effect, template, opacity, effectState, surface, fullRes }: PanelBackgroundShaderProps) {
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
  // The Q-series AIO panel GPU can't hold frame rate on heavy shaders at native
  // res, so cap its backing store to half DPR. q60 is the only Q-series surface
  // (Q60 + Q80 share the LCD and both infer to it). fullRes lifts the cap for
  // the desktop simulator, which renders on the host GPU.
  const renderOptions = useMemo(() => (
    { maxDevicePixelRatio: surface === 'q60' && !fullRes ? 0.5 : 1 }
  ), [surface, fullRes]);
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
