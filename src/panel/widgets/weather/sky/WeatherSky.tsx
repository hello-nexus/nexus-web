import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { peekShaderSource, primeShaderSource } from '../../../../api/lighting';
import type { WeatherSnapshot } from '../../../../api/weather';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import { streamFrameCap } from '../../../../lib/framePacer';
import type { EffectState } from '../../../../types/lighting';
import type { PanelSurface } from '../../../types';
import { useWallClock } from '../useWallClock';
import skyFrag from './weathersky.frag?raw';
import { weatherSkyParams, type WeatherSkyParams } from './weatherSkyParams';
import styles from './WeatherSky.module.scss';

// Bundled, never fetched: not a lighting effect, so the service has no such shader.
const EFFECT = 'weather-sky';

// Primed on first render, not at import: the widget registry pulls this
// module into every panel page and test that imports it.
function primeSkyShader() {
  if (!peekShaderSource(EFFECT)) primeShaderSource(EFFECT, skyFrag);
}

const SKY_TICK_MS = 60 * 1000;
const TWEEN_MS = 3000;
const MAX_FPS = 30;
// Sun, moon and phase move continuously except at wraps (midnight, sunrise,
// new moon), where a tween would sweep them across the sky; they snap.
const TWEENED = ['u_cloud', 'u_rain', 'u_snow', 'u_fog', 'u_storm', 'u_wind'];

function skyState(params: WeatherSkyParams): EffectState {
  return { speed: 50, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params };
}

interface WeatherSkyProps {
  snap: WeatherSnapshot;
  surface?: PanelSurface;
  // 2x2round: the widget box is a square inscribed in the glass.
  round?: boolean;
  children: ReactNode;
}

// Animated sky behind the weather tile and its immersive view, drawn from the
// live snapshot (condition, cloud cover, precipitation, wind, sun and moon).
// Content switches to light text only once the sky has drawn, so a panel
// without WebGL2 keeps its themed card and readable text.
export function WeatherSky({ snap, surface, round, children }: WeatherSkyProps) {
  primeSkyShader();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const now = useWallClock(SKY_TICK_MS);
  const target = useMemo(() => weatherSkyParams(snap, now), [snap, now]);
  const stateRef = useRef<EffectState>(skyState(target));

  // Eases to each new reading so a condition change morphs instead of cutting.
  useEffect(() => {
    const from = stateRef.current.params;
    if (TWEENED.every(key => from[key] === target[key])) {
      stateRef.current = skyState(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (ts: number) => {
      const k = Math.min(1, Math.max(0, (ts - start) / TWEEN_MS));
      const e = k * k * (3 - 2 * k);
      const params: WeatherSkyParams = { ...target };
      for (const key of TWEENED) {
        const a = from[key] ?? target[key];
        params[key] = a + (target[key] - a) * e;
      }
      stateRef.current = skyState(params);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // Pager pages all stay mounted; a tile scrolled off-page stops drawing.
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      visibleRef.current = entries[entries.length - 1].isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  // The Q-series panel GPU cannot hold frame rate at native resolution.
  const lowEnd = surface === 'q60';
  const renderOptions = useMemo(
    // A streamed panel's capture rate can sit below the cap; drawing faster is thrown away.
    () => ({ maxDevicePixelRatio: lowEnd ? 0.5 : 1, maxFps: Math.min(MAX_FPS, streamFrameCap(window.location.search) ?? MAX_FPS), screenSize: true, visibleRef }),
    [lowEnd],
  );
  const { ready, error } = useShaderRenderer(canvasRef, EFFECT, stateRef, undefined, renderOptions, reducedMotion);

  return (
    <div ref={rootRef} className={`${styles.root}${round ? ` ${styles.round}` : ''}`} data-sky={ready && !error ? 'true' : 'false'}>
      <div className={styles.sky} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.scrim} />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
