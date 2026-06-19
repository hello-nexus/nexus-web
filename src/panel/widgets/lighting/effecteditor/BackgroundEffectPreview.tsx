import { useEffect, useRef } from 'react';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
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
export function BackgroundEffectPreview({ effect, template, effectState }: {
  effect: string;
  template: number;
  effectState?: EffectState;
}) {
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
