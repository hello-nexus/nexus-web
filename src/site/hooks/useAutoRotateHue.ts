import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './useTickingHistory';

// Slow enough to read as ambient, fast enough that the wheel visibly turns.
const HUE_PER_SECOND = 0.035;
// Idle window after the last user touch before the auto-rotation resumes.
const RESUME_AFTER_MS = 4000;

/**
 * Drives the lighting demo's hue: an rAF loop turns the wheel on its own;
 * any user change pauses it and it resumes once the wheel has been idle for
 * a few seconds. Colorize is user-owned (never auto-driven).
 */
export function useAutoRotateHue(initialHue: number, initialColorize: number, active: boolean): {
  hue: number;
  colorize: number;
  onUserChange: (hue: number, colorize: number) => void;
} {
  const [hue, setHue] = useState(initialHue);
  const [colorize, setColorize] = useState(initialColorize);
  const hueRef = useRef(initialHue);
  const lastTouchRef = useRef(0);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    let raf = 0;
    let prev = performance.now();
    let pushedHue = hueRef.current;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (now - lastTouchRef.current > RESUME_AFTER_MS) {
        hueRef.current = (hueRef.current + dt * HUE_PER_SECOND) % 1;
        // Publish to React only every ~0.0015 hue (a few frames at 60 Hz):
        // per-frame setState would re-render the whole section at refresh
        // rate for an imperceptible sub-pixel ring rotation.
        const delta = Math.abs(hueRef.current - pushedHue);
        if (Math.min(delta, 1 - delta) > 0.0015) {
          pushedHue = hueRef.current;
          setHue(pushedHue);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const onUserChange = (h: number, c: number) => {
    lastTouchRef.current = performance.now();
    hueRef.current = h;
    setHue(h);
    setColorize(c);
  };

  return { hue, colorize, onUserChange };
}
