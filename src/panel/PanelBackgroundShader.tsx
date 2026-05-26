import { useEffect, useRef, type CSSProperties } from 'react';
import { useShaderRenderer } from '../hooks/useShaderRenderer';
import {
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
} from './panelBackground';
import styles from './PanelApp.module.scss';

const PANEL_BACKGROUND_RENDER_OPTIONS = { maxDevicePixelRatio: 1 };

interface PanelBackgroundShaderProps {
  effect: string;
  template: number;
  opacity: number;
}

export function PanelBackgroundShader({ effect, template, opacity }: PanelBackgroundShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const normalizedEffect = normalizePanelBackgroundEffect(effect);
  const normalizedTemplate = normalizePanelBackgroundTemplate(template);
  // The shader's render loop reads stateRef.current on every frame, so
  // pushing the new value via an effect is fine — the next animation
  // frame picks it up. Initialize with the same normalized inputs so
  // the very first frame doesn't render against stale state.
  const stateRef = useRef(panelBackgroundState(normalizedEffect, normalizedTemplate));
  useEffect(() => {
    stateRef.current = panelBackgroundState(normalizedEffect, normalizedTemplate);
  }, [normalizedEffect, normalizedTemplate]);
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
