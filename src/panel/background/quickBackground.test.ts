import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { applyQuickBackgroundMedia } from './quickBackground';
import { useCoverNotice } from './useCoverNotice';

describe('applyQuickBackgroundMedia', () => {
  it('switches the background to media and commits the picked item', () => {
    const commitBackgroundMode = vi.fn();
    const commitBackgroundMedia = vi.fn();
    applyQuickBackgroundMedia({ commitBackgroundMode, commitBackgroundMedia }, 'm1', 'animated', true);
    expect(commitBackgroundMode).toHaveBeenCalledWith('media');
    expect(commitBackgroundMedia).toHaveBeenCalledWith('m1', 'animated', true);
  });
});

describe('useCoverNotice', () => {
  it('stays hidden until a quick edit arms it', () => {
    const { result } = renderHook(() => useCoverNotice(true));
    expect(result.current.visible).toBe(false);
  });

  it('shows after arming while the widget covers the background', () => {
    const { result } = renderHook(() => useCoverNotice(true));
    act(() => result.current.arm());
    expect(result.current.visible).toBe(true);
  });

  it('does not arm for a widget that leaves the background visible', () => {
    const { result, rerender } = renderHook(({ covered }) => useCoverNotice(covered), { initialProps: { covered: false } });
    act(() => result.current.arm());
    rerender({ covered: true });
    expect(result.current.visible).toBe(false);
  });

  it('clears when the widget stops covering, and does not return on its own', () => {
    const { result, rerender } = renderHook(({ covered }) => useCoverNotice(covered), { initialProps: { covered: true } });
    act(() => result.current.arm());
    rerender({ covered: false });
    expect(result.current.visible).toBe(false);
    rerender({ covered: true });
    expect(result.current.visible).toBe(false);
  });
});
