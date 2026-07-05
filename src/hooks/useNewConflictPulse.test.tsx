import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DetectedConflict } from '../api/conflicts';
import { useNewConflictPulse } from './useNewConflictPulse';

function conflict(id: string): DetectedConflict {
  return { id, displayName: id, category: 'lighting', processName: id, pid: 1 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNewConflictPulse', () => {
  it('does not pulse for apps already running at the first loaded snapshot', () => {
    const { result } = renderHook(
      ({ conflicts, ready }) => useNewConflictPulse(conflicts, ready),
      { initialProps: { conflicts: [conflict('icue')], ready: true } },
    );
    expect(result.current).toBe(false);
  });

  it('pulses when a new app appears, then clears after the pulse window', () => {
    const { result, rerender } = renderHook(
      ({ conflicts, ready }) => useNewConflictPulse(conflicts, ready),
      { initialProps: { conflicts: [] as DetectedConflict[], ready: true } },
    );
    expect(result.current).toBe(false); // baseline (empty)

    act(() => rerender({ conflicts: [conflict('icue')], ready: true }));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('does not pulse when an app disappears', () => {
    const { result, rerender } = renderHook(
      ({ conflicts, ready }) => useNewConflictPulse(conflicts, ready),
      { initialProps: { conflicts: [conflict('icue')], ready: true } },
    );
    act(() => rerender({ conflicts: [] as DetectedConflict[], ready: true }));
    expect(result.current).toBe(false);
  });

  it('ignores snapshots until ready, then treats the first ready snapshot as the silent baseline', () => {
    const { result, rerender } = renderHook(
      ({ conflicts, ready }) => useNewConflictPulse(conflicts, ready),
      { initialProps: { conflicts: [] as DetectedConflict[], ready: false } },
    );
    // A reconnect drops the baseline; the first ready snapshot (already-running
    // app) must not pulse.
    act(() => rerender({ conflicts: [conflict('icue')], ready: true }));
    expect(result.current).toBe(false);
  });

  it('does not flag pre-existing apps as new after a mid-session reconnect', () => {
    const { result, rerender } = renderHook(
      ({ conflicts, ready }) => useNewConflictPulse(conflicts, ready),
      { initialProps: { conflicts: [conflict('icue')], ready: true } },
    );
    // Reconnect: ready drops, then the first post-reconnect snapshot still lists
    // icue (already running) alongside a genuinely new app.
    act(() => rerender({ conflicts: [conflict('icue')], ready: false }));
    act(() => rerender({ conflicts: [conflict('icue'), conflict('nzxt-cam')], ready: true }));
    // First ready snapshot after reconnect re-seeds silently, even though it
    // contains an app absent from the pre-reconnect baseline.
    expect(result.current).toBe(false);
  });
});
