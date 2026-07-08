import { useEffect, useMemo, useRef, useState } from 'react';
import { PERF_HISTORY_SAMPLES } from '../../panel/widgets/common/panelHistoryConfig';

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Same mean-reverting walk as MonitoringPreview's synthHistory (kept local:
// that file's fixture shape is pinned by previewMode.test.tsx). The value
// hovers around `base` with `swing` noise; `spike` adds sharp mostly-upward
// transients so a CPU trace reads busy instead of sinusoidal.
function step(v: number, base: number, swing: number, spike: number): number {
  let next = v + (base - v) * 0.16 + (Math.random() - 0.5) * swing;
  if (spike && Math.random() < spike) {
    next += Math.random() * 46 - 10;
  }
  return Math.round(Math.max(4, Math.min(98, next)));
}

function seedHistory(base: number, swing: number, spike: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < PERF_HISTORY_SAMPLES; i++) {
    v = step(v, base, swing, spike);
    out.push(v);
  }
  return out;
}

export interface TickingSpec {
  base: number;
  swing: number;
  spike?: number;
}

/**
 * Animated mock telemetry for the marketing demos: pre-seeded history
 * buffers that shift one new sample in per tick while `active`. One shared
 * interval drives every series so the gauges move in lockstep. Frozen under
 * prefers-reduced-motion (the seeded buffers still render plausible traces).
 * The specs array's length is fixed at mount (buffers seed once); per-spec
 * values may change, but added or removed entries are ignored.
 */
export function useTickingHistories(
  specs: readonly TickingSpec[],
  opts?: { intervalMs?: number; active?: boolean },
): Array<{ history: number[]; value: number }> {
  const intervalMs = opts?.intervalMs ?? 1000;
  const active = opts?.active ?? true;
  const [histories, setHistories] = useState(
    () => specs.map(s => seedHistory(s.base, s.swing, s.spike ?? 0)));
  // The specs array is authored inline at the call site; the walk only reads
  // it inside the interval, so keep the latest without re-arming the timer.
  const specsRef = useRef(specs);
  specsRef.current = specs;

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const id = setInterval(() => {
      setHistories(prev => prev.map((history, i) => {
        const s = specsRef.current[i];
        if (!s) return history;
        const last = history[history.length - 1] ?? s.base;
        return [...history.slice(1), step(last, s.base, s.swing, s.spike ?? 0)];
      }));
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return useMemo(
    () => histories.map((history, i) => ({
      history,
      value: history[history.length - 1] ?? specsRef.current[i]?.base ?? 0,
    })),
    [histories]);
}
