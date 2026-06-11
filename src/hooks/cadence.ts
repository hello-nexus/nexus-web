import { useCallback, useRef } from 'react';

/*
 * Generic cadence helper for rate-limiting work driven by user interaction
 * (typically slider drags or pointer streams). useThrottle keeps the first
 * + latest call in a window.
 */

/**
 * Leading + trailing throttle. The first call in a quiet period fires
 * immediately; subsequent calls within `ms` are coalesced and the latest fires
 * once when the window expires. Used to drive live shader uniforms during
 * slider drag without flooding the local service with HTTP calls.
 */
export function useThrottle(ms = 33) {
  const lastFire = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<(() => void) | null>(null);
  return useCallback((fn: () => void) => {
    pending.current = fn;
    const now = Date.now();
    const remaining = ms - (now - lastFire.current);
    if (remaining <= 0) {
      lastFire.current = now;
      pending.current = null;
      fn();
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = undefined;
        if (pending.current) {
          lastFire.current = Date.now();
          const f = pending.current;
          pending.current = null;
          f();
        }
      }, remaining);
    }
  }, [ms]);
}
