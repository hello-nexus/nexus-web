import { useEffect, useRef, useState } from 'react';
import { createFramePacer, streamFrameCap } from './framePacer';

const easeOut = (t: number) => 1 - (1 - t) ** 5;

/**
 * Eases toward `target` from the page's paced rAF loop on a stream page, where a CSS transition
 * would free-run the host compositor. Returns null off a stream page: the caller keeps its CSS transition.
 */
export function useStreamTween(target: number, durationMs: number): number | null {
  const cap = streamFrameCap(window.location.search);
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (cap === null) return undefined;
    const from = current.current;
    if (from === target) return undefined;
    const pace = createFramePacer(cap);
    const start = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / durationMs);
      if (t >= 1 || pace(ts)) {
        current.current = t >= 1 ? target : from + (target - from) * easeOut(t);
        setValue(current.current);
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, cap, durationMs]);
  return cap === null ? null : value;
}
