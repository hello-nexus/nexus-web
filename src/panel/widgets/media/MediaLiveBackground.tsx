import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnimateTemplates } from '../../../hooks/useAnimateTemplates';
import { useAudioState } from '../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import { usePanelImmersive, usePanelImmersiveOpen } from '../common/PanelImmersiveContext';
import { useArtPaletteStops } from './artPalette';
import { visualizerState } from './mediaVisualizers';
import styles from './MediaWidget.module.scss';

interface MediaLiveBackgroundProps {
  effect: string;
  // Null while the current track's art loads; empty when it has none.
  artUrl: string | null;
  playing: boolean;
  // Editor preview: animates the effect without subscribing to audio.
  preview: boolean;
  className?: string;
  // True once a frame is on screen; false before the first one and when the
  // renderer fails, so the caller can style text for whatever is behind it.
  onShowingChange?: (showing: boolean) => void;
}

/**
 * The selected visualizer effect behind the media tile, in the album art's
 * colours, through the same renderer as the immersive visualizer, capped in
 * resolution and frame rate. It skips drawing while off screen, while an
 * immersive overlay covers it, and while playback is paused, holding its last
 * frame and keeping the compiled program.
 */
export function MediaLiveBackground({ effect, artUrl, playing, preview, className, onShowingChange }: MediaLiveBackgroundProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const overlayOpen = usePanelImmersiveOpen();
  const insideOverlay = usePanelImmersive();
  const covered = overlayOpen && !insideOverlay;
  const visible = onScreen && !covered;
  const drawRef = useRef(true);
  drawRef.current = visible && (playing || preview);
  const audioRef = useAudioState(!preview && playing && visible);
  const paletteRef = useArtPaletteStops(artUrl);
  const { templates } = useAnimateTemplates(!preview);
  const state = useMemo(() => visualizerState(effect, templates[effect]), [effect, templates]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      setOnScreen(entries[entries.length - 1].isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const options = useMemo(() => ({
    maxDevicePixelRatio: 0.5,
    maxFps: 30,
    // Panel cells are CSS-scaled; size the buffer from the pixels on screen.
    screenSize: true,
    visibleRef: drawRef,
    paletteRef,
    audioTime: true,
  }), [paletteRef]);
  const { ready, error } = useShaderRenderer(canvasRef, effect, stateRef, audioRef, options);
  const showing = ready && !error;
  useEffect(() => { onShowingChange?.(showing); }, [showing, onShowingChange]);

  if (error) return null;
  return (
    <div
      ref={wrapRef}
      className={`${styles.liveBackground} ${className ?? ''}`}
      data-ready={ready ? 'true' : 'false'}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.liveCanvas} />
    </div>
  );
}
