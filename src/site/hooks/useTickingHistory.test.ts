import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTickingHistory } from './useTickingHistory';
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

describe('useTickingHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    allowMotion();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('seeds a full clamped history buffer', () => {
    const { result } = renderHook(() => useTickingHistory(50, 10, { active: false }));
    expect(result.current.history).toHaveLength(PERF_HISTORY_SAMPLES);
    for (const v of result.current.history) {
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(98);
    }
  });

  it('shifts one new sample per tick while active and keeps length', () => {
    const { result } = renderHook(() => useTickingHistory(50, 10, { intervalMs: 1000 }));
    const before = result.current.history;
    act(() => { vi.advanceTimersByTime(3000); });
    const after = result.current.history;
    expect(after).toHaveLength(PERF_HISTORY_SAMPLES);
    // The window slid by 3: the first 3 seeded samples fell off the front.
    expect(after.slice(0, PERF_HISTORY_SAMPLES - 3)).toEqual(before.slice(3));
  });

  it('does not tick when inactive', () => {
    const { result } = renderHook(() => useTickingHistory(50, 10, { active: false }));
    const before = result.current.history;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.history).toEqual(before);
  });
});
