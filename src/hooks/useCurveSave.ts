import { useCallback, useRef, useState } from 'react';
import { saveCurves, type WireCurve } from '../api/cooling';
import { newGuardError, type GuardErrorState } from '../panel/widgets/cooling/page/guardUtils';
import { useTranslation } from '../lib/i18n';

type CurvesBody = { globalSpeedModifier: number; curves: WireCurve[] };

interface Waiter {
  resolve: (res: unknown) => void;
  reject: (err: unknown) => void;
}

/**
 * Curve save shared by the cooling page and the immersive view.
 *
 * One save runs at a time and the newest body wins: a save that arrives while
 * another is in flight replaces any body not yet saved, and every caller's
 * promise resolves once a save covering it has landed. Saves are never
 * reordered.
 */
export function useCurveSave(options: {
  /** Called after each successful save. */
  onSaved?: () => void;
} = {}): {
  save: (body: CurvesBody) => Promise<unknown>;
  /** The last failed save; cleared by the next successful save. */
  error: GuardErrorState | null;
} {
  const { t } = useTranslation();
  const [error, setError] = useState<GuardErrorState | null>(null);
  const latestRef = useRef<CurvesBody | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  const runningRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const tRef = useRef(t);
  tRef.current = t;

  const run = useCallback(async () => {
    runningRef.current = true;
    // Waiters whose body was superseded before it saved ride along to the next save.
    let batch: Waiter[] = [];
    try {
      while (latestRef.current) {
        const body = latestRef.current;
        latestRef.current = null;
        batch = batch.concat(waitersRef.current.splice(0));
        try {
          const res = await saveCurves(body);
          const saved = !!res && !(res as { error?: boolean }).error;
          if (!saved) {
            setError(newGuardError(tRef.current('cooling.guard.error.save')));
          } else {
            setError(null);
            optionsRef.current.onSaved?.();
          }
          for (const w of batch) w.resolve(res);
          batch = [];
        } catch (err) {
          for (const w of batch) w.reject(err);
          batch = [];
        }
      }
    } finally {
      runningRef.current = false;
      // A body queued after the loop's last check still needs its turn.
      if (latestRef.current) void run();
    }
  }, []);

  const save = useCallback((body: CurvesBody) => new Promise<unknown>((resolve, reject) => {
    latestRef.current = body;
    waitersRef.current.push({ resolve, reject });
    if (!runningRef.current) void run();
  }), [run]);

  return { save, error };
}
