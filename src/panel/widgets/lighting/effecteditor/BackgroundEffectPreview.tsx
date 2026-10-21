import { useEffect, useRef } from 'react';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import { useShaderParams } from '../../../../hooks/useShaderParams';
import { SensorSignalProvider } from '../../../../hooks/SensorSignalProvider';
import type { EffectState } from '../../../../types/lighting';
import {
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
} from '../../../background/panelBackground';
import styles from './BackgroundEffectPreview.module.scss';

const RENDER_OPTIONS = { maxDevicePixelRatio: 1 };

/**
 * Live preview of the panel background effect, rendered with the same shader
 * system the real background uses (useShaderRenderer + panelBackgroundState).
 * Shown above the Options/Effect tabs in the settings editor so slider/colour
 * tweaks read back immediately. Background opacity is intentionally NOT applied
 * here - the preview shows the effect at full strength.
 */
export function BackgroundEffectPreview(props: BackgroundEffectPreviewProps) {
  const usesSensors = useShaderParams(normalizePanelBackgroundEffect(props.effect)).sensors.length > 0;
  // Always mounted, toggled via `enabled`: the renderer keeps the sensor signal it saw at compile time.
  return (
    <SensorSignalProvider enabled={usesSensors}>
      <BackgroundEffectPreviewCanvas {...props} />
    </SensorSignalProvider>
  );
}

interface BackgroundEffectPreviewProps {
  effect: string;
  template: number;
  effectState?: EffectState;
}

function BackgroundEffectPreviewCanvas({ effect, template, effectState }: BackgroundEffectPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = normalizePanelBackgroundEffect(effect);
  const tpl = normalizePanelBackgroundTemplate(template);
  const stateRef = useRef(effectState ?? panelBackgroundState(fx, tpl));
  useEffect(() => {
    stateRef.current = effectState ?? panelBackgroundState(fx, tpl);
  }, [fx, tpl, effectState]);
  const { ready, error } = useShaderRenderer(canvasRef, fx, stateRef, undefined, RENDER_OPTIONS);

  return (
    <div className={styles.preview} data-ready={ready && !error ? 'true' : 'false'}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
