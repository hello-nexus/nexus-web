import { useEffect, useState } from 'react';

const CLOCK_TICK_MS = 30 * 1000;

// Wall clock that re-renders on a coarse tick, for the per-place local time
// readouts and the sun-arc position.
export function useWallClock(intervalMs = CLOCK_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
