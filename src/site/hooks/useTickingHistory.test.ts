import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTickingHistories } from './useTickingHistory';
import { PERF_HISTORY_SAMPLES } from '../../panel/widgets/common/panelHistoryConfig';

function allowMotion() {
  // The shared setup stubs matchMedia to `matches: true` for non-light
  // queries, which reads as prefers-reduced-motion and freezes the ticker.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const SPECS = [
  { base: 50, swing: 10 },
  { base: 70, swing: 5, spike: 0.2 },
] as const;

describe('useTickingHistories', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    allowMotion();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('seeds a full clamped history buffer per spec', () => {
    const { result } = renderHook(() => useTickingHistories(SPECS, { active: false }));
    expect(result.current).toHaveLength(SPECS.length);
    for (const series of result.current) {
      expect(series.history).toHaveLength(PERF_HISTORY_SAMPLES);
      for (const v of series.history) {
        expect(v).toBeGreaterThanOrEqual(4);
        expect(v).toBeLessThanOrEqual(98);
      }
    }
  });

  it('shifts every series one sample per shared tick and keeps length', () => {
    const { result } = renderHook(() => useTickingHistories(SPECS, { intervalMs: 1000 }));
    const before = result.current.map(s => s.history);
    act(() => { vi.advanceTimersByTime(3000); });
    for (const [i, series] of result.current.entries()) {
      expect(series.history).toHaveLength(PERF_HISTORY_SAMPLES);
      // The window slid by 3 in lockstep across series.
      expect(series.history.slice(0, PERF_HISTORY_SAMPLES - 3)).toEqual(before[i].slice(3));
    }
  });

  it('does not tick when inactive', () => {
    const { result } = renderHook(() => useTickingHistories(SPECS, { active: false }));
    const before = result.current.map(s => s.history);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.map(s => s.history)).toEqual(before);
  });
});
