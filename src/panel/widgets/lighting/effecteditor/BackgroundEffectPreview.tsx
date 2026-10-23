import { useEffect, useRef } from 'react';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import { useShaderParams } from '../../../../hooks/useShaderParams';
import { SensorSignalProvider } from '../../../../hooks/SensorSignalProvider';
import { useAudioState } from '../../../../hooks/useAudioState';
import type { EffectState } from '../../../../types/lighting';
import {
  isAudioBackgroundEffect,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
  resolveBackgroundEffectForSurface,
} from '../../../background/panelBackground';
import { detectOS } from '../../../../lib/platform';
import { MusicReactiveControl } from '../page/MusicReactiveControl';
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
  const usesSensors = useShaderParams(resolveBackgroundEffectForSurface(normalizePanelBackgroundEffect(props.effect), props.audioReactive === true)).sensors.length > 0;
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
  /** panelAudioReactiveAllowed for the surface being edited; unset draws an audio effect as the default. */
  audioReactive?: boolean;
}

function BackgroundEffectPreviewCanvas({ effect, template, effectState, audioReactive = false }: BackgroundEffectPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = resolveBackgroundEffectForSurface(normalizePanelBackgroundEffect(effect), audioReactive);
  const tpl = normalizePanelBackgroundTemplate(template);
  const stateRef = useRef(effectState ?? panelBackgroundState(fx, tpl));
  useEffect(() => {
    stateRef.current = effectState ?? panelBackgroundState(fx, tpl);
  }, [fx, tpl, effectState]);
  const audioRef = useAudioState(audioReactive && isAudioBackgroundEffect(fx));
  const { ready, error } = useShaderRenderer(canvasRef, fx, stateRef, audioRef, RENDER_OPTIONS);

  return (
    <div className={styles.preview} data-ready={ready && !error ? 'true' : 'false'}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {audioReactive && isAudioBackgroundEffect(fx) && (
        <MusicReactiveControl active showSource={detectOS() === 'windows'} />
      )}
    </div>
  );
}
