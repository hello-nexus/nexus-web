import { useEffect, useMemo, useRef } from 'react';
import { useAnimateTemplates } from '../../../hooks/useAnimateTemplates';
import { useAudioState } from '../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import type { PanelSurface } from '../../types';
import { visualizerState } from './mediaVisualizers';
import styles from './MediaTouch.module.scss';

interface MediaVisualizerProps {
  effect: string;
  surface?: PanelSurface;
  // Fired when the shader cannot render (source fetch failed against an older
  // service, no WebGL2). The canvas stays transparent in that case, so the
  // caller has to put something else behind the player.
  onUnavailable?: (unavailable: boolean) => void;
}

/**
 * Fullscreen audio-reactive shader behind the immersive player. Subscribing to
 * the audio topic is what starts service-side capture (see
 * LightingProvider.SetAudioCaptureDemand); with no capture the shaders still
 * render their idle animation, so a silent frame is never a blank one.
 */
export function MediaVisualizer({ effect, surface, onUnavailable }: MediaVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useAudioState(true);
  const { templates } = useAnimateTemplates(true);

  const state = useMemo(
    () => visualizerState(effect, templates[effect]),
    [effect, templates],
  );
  // The render loop reads stateRef.current each frame; seeding it at mount
  // keeps the first frame off the stale-state path.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Same half-DPR cap PanelBackgroundShader applies: the Q-series panel GPU
  // cannot hold frame rate on a heavy shader at native resolution.
  const renderOptions = useMemo(
    () => ({ maxDevicePixelRatio: surface === 'q60' ? 0.5 : 1 }),
    [surface],
  );
  const { ready, error } = useShaderRenderer(canvasRef, effect, stateRef, audioRef, renderOptions);

  useEffect(() => { onUnavailable?.(!!error); }, [error, onUnavailable]);

  return (
    <div className={styles.visualizer} data-ready={ready && !error ? 'true' : 'false'} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.visualizerCanvas} />
    </div>
  );
}
