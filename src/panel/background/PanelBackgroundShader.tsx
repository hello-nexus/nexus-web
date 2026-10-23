import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useShaderRenderer } from '../../hooks/useShaderRenderer';
import { useShaderParams } from '../../hooks/useShaderParams';
import { SensorSignalProvider } from '../../hooks/SensorSignalProvider';
import { useAudioState } from '../../hooks/useAudioState';
import { useMusicReactive } from '../../hooks/useMusicReactive';
import type { EffectState } from '../../types/lighting';
import type { PanelSurface } from '../types';
import {
  isAudioBackgroundEffect,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  panelBackgroundState,
  resolveBackgroundDrawing,
  resolveBackgroundEffectForSurface,
} from './panelBackground';
import { usePanelAudioReactive } from './panelAudio';
import styles from '../PanelApp.module.scss';
import { usePanelGlassSurface } from '../widgets/common/PanelGlassSurfaceContext';

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
  // An opaque widget hides the whole background: stop drawing, keep the last
  // frame and the compiled program so uncovering resumes on the next frame.
  covered?: boolean;
}

// The provider stays mounted and is toggled through `enabled`: useShaderRenderer
// keeps the sensor signal it saw at compile time, so a provider that appeared
// later would never reach an already-compiled effect.
export function PanelBackgroundShader(props: PanelBackgroundShaderProps) {
  const audioAllowed = usePanelAudioReactive(props.surface);
  const usesSensors = useShaderParams(
    resolveBackgroundEffectForSurface(normalizePanelBackgroundEffect(props.effect), audioAllowed),
  ).sensors.length > 0;
  return (
    <SensorSignalProvider enabled={usesSensors}>
      <PanelBackgroundShaderLayer {...props} />
    </SensorSignalProvider>
  );
}

function PanelBackgroundShaderLayer({ effect, template, opacity, effectState, surface, fullRes, covered = false }: PanelBackgroundShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioAllowed = usePanelAudioReactive(surface);
  const drawing = resolveBackgroundDrawing(
    normalizePanelBackgroundEffect(effect),
    normalizePanelBackgroundTemplate(template),
    effectState,
    audioAllowed,
  );
  const normalizedEffect = drawing.effect;
  const normalizedTemplate = drawing.template;
  const drawnState = drawing.effectState;
  // The render loop reads stateRef.current each frame, so an effect push is
  // picked up next frame. Initialize with the same normalized inputs so the
  // first frame doesn't render stale state.
  const stateRef = useRef(drawnState ?? panelBackgroundState(normalizedEffect, normalizedTemplate));
  useEffect(() => {
    stateRef.current = drawnState ?? panelBackgroundState(normalizedEffect, normalizedTemplate);
  }, [normalizedEffect, normalizedTemplate, drawnState]);
  // The Q-series AIO panel GPU can't hold frame rate on heavy shaders at native
  // res, so cap its backing store to half DPR. q60 is the only Q-series surface
  // (Q60 + Q80 share the LCD and both infer to it). fullRes lifts the cap for
  // the desktop simulator, which renders on the host GPU.
  const visibleRef = useRef(!covered);
  visibleRef.current = !covered;
  const glass = usePanelGlassSurface(surface);
  const renderOptions = useMemo(() => (
    { maxDevicePixelRatio: glass === 'q60' && !fullRes ? 0.5 : 1, visibleRef }
  ), [glass, fullRes]);
  // Subscribing is what makes the service capture audio, so only an audio
  // effect that is on screen holds the subscription.
  // Music Reactive off keeps the effect on screen but silent, with no subscription.
  const audioShown = audioAllowed && isAudioBackgroundEffect(normalizedEffect);
  const music = useMusicReactive(audioShown);
  const audioRef = useAudioState(audioShown && music.enabled && !covered);
  const { ready, error } = useShaderRenderer(
    canvasRef,
    normalizedEffect,
    stateRef,
    audioRef,
    renderOptions,
  );
  const style = {
    '--panel-background-opacity': normalizePanelBackgroundOpacity(opacity),
  } as CSSProperties;

  return (
    <div
      className={styles.backgroundShader}
      data-ready={ready && !error ? 'true' : 'false'}
      data-panel-bg-layer
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.backgroundShaderCanvas} />
    </div>
  );
}
