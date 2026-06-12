import { useEffect, useRef, type CSSProperties } from 'react';
import { useShaderRenderer } from '../../hooks/useShaderRenderer';
import type { EffectState } from '../../types/lighting';
import {
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
} from './panelBackground';
import styles from '../PanelApp.module.scss';

const PANEL_BACKGROUND_RENDER_OPTIONS = { maxDevicePixelRatio: 1 };

interface PanelBackgroundShaderProps {
  effect: string;
  template: number;
  opacity: number;
  // Per-panel custom state layered on the template default. Undefined renders
  // the plain template (legacy records / no customization).
  effectState?: EffectState;
}

export function PanelBackgroundShader({ effect, template, opacity, effectState }: PanelBackgroundShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const normalizedEffect = normalizePanelBackgroundEffect(effect);
  const normalizedTemplate = normalizePanelBackgroundTemplate(template);
  // The render loop reads stateRef.current each frame, so an effect push is
  // picked up next frame. Initialize with the same normalized inputs so the
  // first frame doesn't render stale state.
  const stateRef = useRef(panelBackgroundState(normalizedEffect, normalizedTemplate, effectState));
  useEffect(() => {
    stateRef.current = panelBackgroundState(normalizedEffect, normalizedTemplate, effectState);
  }, [normalizedEffect, normalizedTemplate, effectState]);
  const { ready, error } = useShaderRenderer(
    canvasRef,
    normalizedEffect,
    stateRef,
    undefined,
    PANEL_BACKGROUND_RENDER_OPTIONS,
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
