import { useEffect, useState } from 'react';

// Shared sample window for performance / cooling sparklines. The buffer cap and
// the Sparkline `sampleCount` must match so the chart renders one continuous
// window without left-padding zeros.
export const PERF_HISTORY_SAMPLES = 40;

/**
 * Rolling history buffer. Each time `value` changes, appends it to an
 * internal ring buffer and returns the buffer. Returns a NEW array
 * reference on every update so consumers that memo on the array ref
 * (e.g. Sparkline's useMemo) see the change and recompute.
 *
 * Sampling interval is implicit in how often `value` updates (usually the
 * hook's polling rate). If you want guaranteed cadence, wrap in your own
 * `useInterval`.
 */
export function useHistory(value: number, samples: number = 60): number[] {
  const [buf, setBuf] = useState<number[]>([]);

  useEffect(() => {
    setBuf(prev => {
      const next = prev.concat(value);
      if (next.length > samples) next.splice(0, next.length - samples);
      return next;
    });
  }, [value, samples]);

  return buf;
}
