import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWidgetPlaylistRotation } from './useWidgetPlaylistRotation';

describe('useWidgetPlaylistRotation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances every interval and wraps', () => {
    const { result } = renderHook(() => useWidgetPlaylistRotation(['a', 'b'], 10, false, false));
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current).toBe('b');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current).toBe('a');
  });

  it('does not restart the interval for a content-equal list', () => {
    const { result, rerender } = renderHook(
      ({ types }) => useWidgetPlaylistRotation(types, 10, false, false),
      { initialProps: { types: ['a', 'b'] } },
    );
    act(() => { vi.advanceTimersByTime(6_000); });
    rerender({ types: ['a', 'b'] });
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(result.current).toBe('b');
  });

  it('returns null while paused and for no playlist', () => {
    const paused = renderHook(() => useWidgetPlaylistRotation(['a', 'b'], 10, false, true));
    expect(paused.result.current).toBeNull();
    const none = renderHook(() => useWidgetPlaylistRotation(null, 10, false, false));
    expect(none.result.current).toBeNull();
  });

  it('jumps to a new cursor and restarts the interval', () => {
    const { result, rerender } = renderHook(
      ({ cursor }) => useWidgetPlaylistRotation(['a', 'b', 'c'], 10, false, false, cursor),
      { initialProps: { cursor: undefined as { type: string; at: number } | undefined } },
    );
    act(() => { vi.advanceTimersByTime(8_000); });
    rerender({ cursor: { type: 'c', at: 1 } });
    expect(result.current).toBe('c');
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(result.current).toBe('c');
    rerender({ cursor: { type: 'c', at: 2 } });
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(result.current).toBe('c');
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current).toBe('a');
  });

  it('holds a one-type playlist', () => {
    const { result } = renderHook(() => useWidgetPlaylistRotation(['a'], 5, false, false));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe('a');
  });
});
