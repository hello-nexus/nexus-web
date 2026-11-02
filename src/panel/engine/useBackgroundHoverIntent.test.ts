import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_HOVER_DELAY_MS, useBackgroundHoverIntent } from './useBackgroundHoverIntent';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useBackgroundHoverIntent', () => {
  it('does not reveal before the delay and reveals after it, measuring first', () => {
    const onReveal = vi.fn();
    const { result } = renderHook(() => useBackgroundHoverIntent(onReveal));
    act(() => result.current.setOver(true));
    act(() => { vi.advanceTimersByTime(BACKGROUND_HOVER_DELAY_MS - 1); });
    expect(result.current.revealed).toBe(false);
    expect(onReveal).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.revealed).toBe(true);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('never reveals when the pointer leaves before the delay', () => {
    const onReveal = vi.fn();
    const { result } = renderHook(() => useBackgroundHoverIntent(onReveal));
    act(() => result.current.setOver(true));
    act(() => { vi.advanceTimersByTime(BACKGROUND_HOVER_DELAY_MS / 2); });
    act(() => result.current.setOver(false));
    act(() => { vi.advanceTimersByTime(BACKGROUND_HOVER_DELAY_MS * 2); });
    expect(result.current.revealed).toBe(false);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('keeps counting while the pointer keeps moving over the background, and hides at once on leaving', () => {
    const { result } = renderHook(() => useBackgroundHoverIntent(() => {}));
    act(() => result.current.setOver(true));
    act(() => { vi.advanceTimersByTime(100); });
    act(() => result.current.setOver(true));
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.revealed).toBe(true);
    act(() => result.current.setOver(false));
    expect(result.current.revealed).toBe(false);
  });
});
