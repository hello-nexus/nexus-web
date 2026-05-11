import { useCallback, useEffect, useRef, useState } from 'react';

interface CountdownState {
  ms: number;
  isRunning: boolean;
  isComplete: boolean;
  start: (h: number, m: number, s: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export function useCountdown(): CountdownState {
  const [ms, setMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const endTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const remainingRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const tick = useCallback(() => {
    const remaining = endTimeRef.current - Date.now();
    if (remaining <= 0) {
      setMs(0);
      setIsRunning(false);
      setIsComplete(true);
      clear();
    } else {
      setMs(remaining);
    }
  }, [clear]);

  const start = useCallback((h: number, m: number, s: number) => {
    const total = (h * 3600 + m * 60 + s) * 1000;
    if (total <= 0) return;
    endTimeRef.current = Date.now() + total;
    setMs(total);
    setIsRunning(true);
    setIsComplete(false);
    clear();
    timerRef.current = setInterval(tick, 100);
  }, [clear, tick]);

  const pause = useCallback(() => {
    remainingRef.current = endTimeRef.current - Date.now();
    setIsRunning(false);
    clear();
  }, [clear]);

  const resume = useCallback(() => {
    if (remainingRef.current <= 0) return;
    endTimeRef.current = Date.now() + remainingRef.current;
    setIsRunning(true);
    clear();
    timerRef.current = setInterval(tick, 100);
  }, [clear, tick]);

  const stop = useCallback(() => {
    setMs(0);
    setIsRunning(false);
    setIsComplete(false);
    clear();
  }, [clear]);

  const reset = useCallback(() => {
    setMs(0);
    setIsRunning(false);
    setIsComplete(false);
    clear();
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { ms, isRunning, isComplete, start, pause, resume, stop, reset };
}
