import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches the api's per-address verify mail cap; the api stays the real limit. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Whole seconds left until the deadline, never negative. */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** Counts down from `initialSeconds` on mount (0 means ready); `start` restarts a full cooldown. */
export function useResendCooldown(initialSeconds: number) {
  const deadline = useRef(0);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (run === 0) deadline.current = Date.now() + initialSeconds * 1000;
    if (deadline.current <= Date.now()) return undefined;
    const id = window.setInterval(() => {
      const left = remainingSeconds(deadline.current, Date.now());
      setRemaining(left);
      if (left === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
    // initialSeconds is only read on mount (run 0); a later prop change must not restart the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const start = useCallback(() => {
    deadline.current = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setRemaining(RESEND_COOLDOWN_SECONDS);
    setRun(r => r + 1);
  }, []);

  return { remaining, start };
}
