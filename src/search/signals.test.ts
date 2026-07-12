import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireSearchSignal, useSearchSignal, clearPendingSearchSignals } from './signals';

describe('search signals', () => {
  beforeEach(() => clearPendingSearchSignals());
  afterEach(() => vi.useRealTimers());

  it('delivers to a mounted subscriber immediately', () => {
    const handler = vi.fn();
    renderHook(() => useSearchSignal('about', handler));
    fireSearchSignal('about');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('holds a signal fired before mount and consumes it on subscribe', () => {
    const handler = vi.fn();
    fireSearchSignal('add-widget');
    renderHook(() => useSearchSignal('add-widget', handler));
    expect(handler).toHaveBeenCalledTimes(1);
    // Consumed once: a remount must not replay it.
    const again = vi.fn();
    renderHook(() => useSearchSignal('add-widget', again));
    expect(again).not.toHaveBeenCalled();
  });

  it('drops a pending signal that outlived its TTL', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    fireSearchSignal('desktop-widgets');
    vi.advanceTimersByTime(10_000);
    renderHook(() => useSearchSignal('desktop-widgets', handler));
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops delivering after unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useSearchSignal('update-modal', handler));
    unmount();
    fireSearchSignal('update-modal');
    expect(handler).not.toHaveBeenCalled();
    clearPendingSearchSignals();
  });
});
