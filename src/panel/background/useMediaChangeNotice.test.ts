import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaChangeNotice } from './useMediaChangeNotice';

const setup = (covered: boolean) => renderHook((c: boolean) => useMediaChangeNotice(c), { initialProps: covered });

describe('useMediaChangeNotice', () => {
  it('shows nothing on load or when the widget starts covering', () => {
    const { result, rerender } = setup(true);
    expect(result.current.visible).toBe(false);
    rerender(false);
    rerender(true);
    expect(result.current.visible).toBe(false);
  });

  it('shows after a media change while the widget covers, and not when it does not', () => {
    const covering = setup(true);
    act(() => covering.result.current.notify());
    expect(covering.result.current.visible).toBe(true);
    const clear = setup(false);
    act(() => clear.result.current.notify());
    expect(clear.result.current.visible).toBe(false);
  });

  it('hides when the widget stops covering and does not return when it covers again', () => {
    const { result, rerender } = setup(true);
    act(() => result.current.notify());
    rerender(false);
    expect(result.current.visible).toBe(false);
    rerender(true);
    expect(result.current.visible).toBe(false);
    act(() => result.current.notify());
    expect(result.current.visible).toBe(true);
  });

  it('hides on dismiss until the next media change', () => {
    const { result } = setup(true);
    act(() => result.current.notify());
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    act(() => result.current.notify());
    expect(result.current.visible).toBe(true);
  });
});
