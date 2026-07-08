import { useEffect, useRef, type RefObject } from 'react';
import type { AudioSnapshot } from '../../hooks/useAudioState';
import { prefersReducedMotion } from './useTickingHistory';

// Beat pulse driving the Beat Builder demo.
const DEMO_BPM = 125;
const BEAT_PERIOD_S = 60 / DEMO_BPM;
// The app's snapshots arrive at the service's analysis-window rate, and the
// renderer's peak decay + history-ring depth are per-snapshot - emitting per
// display frame would double the decay speed on a 120 Hz screen.
const EMIT_INTERVAL_MS = 50;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Synthetic but lively feed: a decaying pulse per beat drives bass/beat,
// slower sines wander the mid/high bands, and both spectra ride a bass-heavy
// falloff with per-band wiggle. Deliberately exaggerated so the demo visibly
// pumps without any real capture.
function synthSnapshot(t: number): AudioSnapshot {
  const phase = (t % BEAT_PERIOD_S) / BEAT_PERIOD_S;
  const pulse = Math.exp(-phase * 5);
  const bass = clamp01(0.3 + 0.7 * pulse + (Math.random() - 0.5) * 0.06);
  const mid = clamp01(0.35 + 0.22 * Math.sin(t * 2.3) + 0.2 * pulse + (Math.random() - 0.5) * 0.1);
  const high = clamp01(0.3 + 0.18 * Math.sin(t * 3.7 + 1.3) + 0.12 * pulse + (Math.random() - 0.5) * 0.12);
  const level = clamp01(0.25 * bass + 0.3 * mid + 0.2 * high + 0.3 * pulse);

  const spectrum: number[] = [];
  for (let i = 0; i < 16; i++) {
    const f = i / 15;
    spectrum.push(clamp01(
      (1 - f * 0.75) * bass * 0.9
      + 0.18 * Math.sin(t * (2 + i * 0.7) + i * 1.7)
      + f * high * 0.45
      + (Math.random() - 0.5) * 0.08,
    ));
  }
  const spectrum64: number[] = [];
  for (let i = 0; i < 64; i++) {
    const f = i / 63;
    spectrum64.push(clamp01(
      (1 - f * 0.8) * bass * 0.9
      + 0.16 * Math.sin(t * (2 + i * 0.35) + i * 0.9)
      + f * high * 0.5
      + (Math.random() - 0.5) * 0.1,
    ));
  }

  return { level, bass, mid, high, beat: pulse, spectrum, spectrum64 };
}

/**
 * A fake AudioSnapshot feed for the marketing lighting demo. Mutation-free
 * per tick (the shader renderer keys its peak-hold / history updates on
 * snapshot identity), refs only - no React re-renders. Idle (null) when
 * inactive or under prefers-reduced-motion, which the audio shaders treat as
 * silence and fall back to their idle animation.
 */
export function useFakeAudio(active: boolean): RefObject<AudioSnapshot | null> {
  const ref = useRef<AudioSnapshot | null>(null);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      ref.current = null;
      return;
    }
    let raf = 0;
    const start = performance.now();
    let lastEmit = -Infinity;
    const tick = (now: number) => {
      if (now - lastEmit >= EMIT_INTERVAL_MS) {
        lastEmit = now;
        ref.current = synthSnapshot((now - start) / 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ref.current = null;
    };
  }, [active]);

  return ref;
}
