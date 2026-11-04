import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamTween } from './useStreamTween';

describe('useStreamTween', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('returns null off a stream page so the caller keeps its CSS transition', () => {
    const { result } = renderHook(() => useStreamTween(3, 500));
    expect(result.current).toBeNull();
  });

  it('eases to the target on a stream page and lands exactly on it', () => {
    window.history.replaceState(null, '', '/?streamFps=30');
    const { result, rerender } = renderHook(({ t }) => useStreamTween(t, 500), { initialProps: { t: 0 } });
    expect(result.current).toBe(0);
    rerender({ t: 4 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(4);
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(4);
  });
});
