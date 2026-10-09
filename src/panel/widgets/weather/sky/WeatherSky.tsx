import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { peekShaderSource, primeShaderSource } from '../../../../api/lighting';
import type { WeatherSnapshot } from '../../../../api/weather';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import { streamFrameCap } from '../../../../lib/framePacer';
import type { EffectState } from '../../../../types/lighting';
import type { PanelSurface } from '../../../types';
import { useWallClock } from '../useWallClock';
import skyFrag from './weathersky.frag?raw';
import { anchorWind, weatherSkyParams, WIND_ANCHOR_ZERO, windUniforms, type WeatherSkyParams, type WindAnchor } from './weatherSkyParams';
import styles from './WeatherSky.module.scss';
import { usePanelGlassSurface } from '../../common/PanelGlassSurfaceContext';

// Bundled, never fetched: not a lighting effect, so the service has no such shader.
const EFFECT = 'weather-sky';

// Primed on first render, not at import: the widget registry pulls this
// module into every panel page and test that imports it.
function primeSkyShader() {
  if (!peekShaderSource(EFFECT)) primeShaderSource(EFFECT, skyFrag);
}

const SKY_TICK_MS = 60 * 1000;
const TWEEN_MS = 2000;
const MAX_FPS = 30;

// The renderer's u_time clock: seconds since UTC midnight.
const shaderNowS = () => (Date.now() % 86_400_000) / 1000;

// Moon phase is cyclic; easing takes the short way round so a new-moon wrap
// never sweeps through a full lunation.
function ease(key: string, a: number, b: number, e: number): number {
  if (key !== 'u_moonPhase') return a + (b - a) * e;
  const d = ((((b - a) % 1) + 1.5) % 1) - 0.5;
  return (((a + d * e) % 1) + 1) % 1;
}

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
  const stateRef = useRef<EffectState>(skyState({ ...target, ...windUniforms(WIND_ANCHOR_ZERO) }));
  const anchorRef = useRef<WindAnchor>({ ...WIND_ANCHOR_ZERO, wind: target.u_wind });
  const lastSnapRef = useRef(snap);
  const easeEndRef = useRef(0);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // A new reading (location switch, refresh) eases every value over; a clock
  // tick only nudges the sun and moon and snaps, so the midnight and sunrise
  // wraps never sweep them across the sky.
  useEffect(() => {
    const write = (params: WeatherSkyParams) => {
      if (!reducedMotion && params.u_wind !== anchorRef.current.wind) {
        anchorRef.current = anchorWind(anchorRef.current, params.u_wind, shaderNowS());
      }
      stateRef.current = skyState({ ...params, ...windUniforms(anchorRef.current) });
    };
    const start = performance.now();
    if (lastSnapRef.current !== snap) easeEndRef.current = start + TWEEN_MS;
    lastSnapRef.current = snap;
    const span = easeEndRef.current - start;
    // Reduced motion freezes u_time, so the unanchored drift is wind * that
    // frozen time: easing the wind would sweep the clouds. It cuts instead.
    if (span <= 0 || reducedMotion) {
      write(target);
      return;
    }
    const from = stateRef.current.params;
    let raf = 0;
    const step = (ts: number) => {
      const k = Math.min(1, Math.max(0, (ts - start) / span));
      const e = k * k * (3 - 2 * k);
      const params: WeatherSkyParams = {};
      for (const key of Object.keys(target)) params[key] = ease(key, from[key] ?? target[key], target[key], e);
      write(params);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [snap, target, reducedMotion]);

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

  // The Q-series panel GPU cannot hold frame rate at native resolution.
  const lowEnd = usePanelGlassSurface(surface) === 'q60';
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
