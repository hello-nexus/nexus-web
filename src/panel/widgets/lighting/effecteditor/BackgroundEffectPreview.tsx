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
  resolveBackgroundDrawing,
  resolveBackgroundEffectForSurface,
} from '../../../background/panelBackground';
import { useServicePlatform } from '../../../../hooks/useServicePlatform';
import { useMusicReactive } from '../../../../hooks/useMusicReactive';
import { useLightingAudioOutput } from '../../../../hooks/useLightingAudioOutput';
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
  const drawing = resolveBackgroundDrawing(
    normalizePanelBackgroundEffect(effect),
    normalizePanelBackgroundTemplate(template),
    effectState,
    audioReactive,
  );
  const fx = drawing.effect;
  const tpl = drawing.template;
  const drawnState = drawing.effectState;
  const stateRef = useRef(drawnState ?? panelBackgroundState(fx, tpl));
  useEffect(() => {
    stateRef.current = drawnState ?? panelBackgroundState(fx, tpl);
  }, [fx, tpl, drawnState]);
  const audioShown = audioReactive && isAudioBackgroundEffect(fx);
  const music = useMusicReactive(audioShown);
  const audioRef = useAudioState(audioShown && music.enabled);
  const platform = useServicePlatform(audioShown);
  const showSource = platform === 'windows' && music.enabled;
  const audioOutput = useLightingAudioOutput(audioShown && showSource);
  const { ready, error } = useShaderRenderer(canvasRef, fx, stateRef, audioRef, RENDER_OPTIONS);

  return (
    <div className={styles.preview} data-ready={ready && !error ? 'true' : 'false'}>
      <canvas ref={canvasRef} className={styles.canvas} />
      {audioShown && (
        <MusicReactiveControl active={music.enabled} onToggle={music.toggle} output={showSource ? audioOutput : undefined} />
      )}
    </div>
  );
}
