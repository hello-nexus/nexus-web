import { useCallback, useEffect, useRef, useState } from 'react';

interface StopwatchState {
  elapsed: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

const STOPWATCH_TICK_MS = 10;

export function useStopwatch(): StopwatchState {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    setIsRunning(true);
    clear();
    timerRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, STOPWATCH_TICK_MS);
  }, [clear]);

  const stop = useCallback(() => {
    const nextElapsed = accumulatedRef.current + Date.now() - startTimeRef.current;
    accumulatedRef.current = nextElapsed;
    setElapsed(nextElapsed);
    setIsRunning(false);
    clear();
  }, [clear]);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    startTimeRef.current = 0;
    setElapsed(0);
    setIsRunning(false);
    clear();
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { elapsed, isRunning, start, stop, reset };
}
