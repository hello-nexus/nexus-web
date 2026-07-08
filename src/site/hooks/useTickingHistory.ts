import { useEffect, useMemo, useState } from 'react';
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

/**
 * Animated mock telemetry for the marketing demos: a pre-seeded history
 * buffer that shifts one new sample in per tick while `active`. Frozen under
 * prefers-reduced-motion (the seeded buffer still renders a plausible trace).
 */
export function useTickingHistory(
  base: number,
  swing: number,
  opts?: { spike?: number; intervalMs?: number; active?: boolean },
): { history: number[]; value: number } {
  const spike = opts?.spike ?? 0;
  const intervalMs = opts?.intervalMs ?? 1000;
  const active = opts?.active ?? true;
  const [history, setHistory] = useState(() => seedHistory(base, swing, spike));

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const id = setInterval(() => {
      setHistory(prev => {
        const last = prev[prev.length - 1] ?? base;
        return [...prev.slice(1), step(last, base, swing, spike)];
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, base, swing, spike, intervalMs]);

  const value = history[history.length - 1] ?? base;
  return useMemo(() => ({ history, value }), [history, value]);
}
