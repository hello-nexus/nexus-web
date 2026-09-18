import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLongPress } from './useLongPress';

function pointerEvent(overrides: Partial<React.PointerEvent> = {}): React.PointerEvent {
  return { clientX: 100, clientY: 200, ...overrides } as React.PointerEvent;
}

describe('useLongPress', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires callback after 500ms hold', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(500); });
    expect(onLongPress).toHaveBeenCalledWith(100, 200);
  });

  it('does not fire if pointer moves beyond threshold', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 120, clientY: 200 })));
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('allows small movement within threshold', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 105, clientY: 203 })));
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).toHaveBeenCalled();
  });

  it('cancels on pointer up', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => result.current.onPointerUp());
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels on pointer cancel', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => result.current.onPointerCancel());
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores a mouse pointer by default', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent({ pointerType: 'mouse' })));
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.firedRef.current).toBe(false);
  });

  it('arms a mouse pointer when allowMouse is set', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500, { allowMouse: true }));

    act(() => result.current.onPointerDown(pointerEvent({ pointerType: 'mouse' })));
    act(() => { vi.advanceTimersByTime(500); });

    expect(onLongPress).toHaveBeenCalledWith(100, 200);
    expect(result.current.firedRef.current).toBe(true);
  });

  it('sets firedRef to true after firing', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    expect(result.current.firedRef.current).toBe(false);
    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.firedRef.current).toBe(true);
  });

  it('resets firedRef on new pointer down', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.firedRef.current).toBe(true);

    act(() => result.current.onPointerDown(pointerEvent()));
    expect(result.current.firedRef.current).toBe(false);
  });
});
