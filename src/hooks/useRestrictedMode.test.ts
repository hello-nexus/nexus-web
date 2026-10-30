import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let frame: ((data: unknown) => void) | null = null;
const topic = vi.fn();
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (name: string, enabled: boolean, cb: (data: unknown) => void) => {
    topic(name, enabled);
    frame = enabled ? cb : null;
  },
}));

import { useRestrictedMode } from './useRestrictedMode';

describe('useRestrictedMode', () => {
  beforeEach(() => { frame = null; topic.mockClear(); });

  it('is false until a frame arrives', () => {
    const { result } = renderHook(() => useRestrictedMode(true));
    expect(result.current).toBe(false);
    expect(topic).toHaveBeenCalledWith('system/session', true);
  });

  it('follows the restricted flag on each frame', () => {
    const { result } = renderHook(() => useRestrictedMode(true));
    act(() => frame?.({ restricted: true }));
    expect(result.current).toBe(true);
    act(() => frame?.({ restricted: false }));
    expect(result.current).toBe(false);
  });

  it('ignores a malformed frame', () => {
    const { result } = renderHook(() => useRestrictedMode(true));
    act(() => frame?.({ restricted: true }));
    act(() => frame?.(null));
    expect(result.current).toBe(false);
  });

  it('never restricts a surface that did not opt in', () => {
    const { result } = renderHook(() => useRestrictedMode(false));
    expect(frame).toBeNull();
    expect(result.current).toBe(false);
  });

  it('ORs the panel record flag with the session flag', () => {
    const { result, rerender } = renderHook(({ flag }) => useRestrictedMode(true, flag), { initialProps: { flag: false } });
    expect(result.current).toBe(false);
    rerender({ flag: true });
    expect(result.current).toBe(true);
    act(() => frame?.({ restricted: true }));
    rerender({ flag: false });
    expect(result.current).toBe(true);
    act(() => frame?.({ restricted: false }));
    expect(result.current).toBe(false);
  });

  it('never restricts a non-kiosk surface even with the record flag', () => {
    const { result } = renderHook(() => useRestrictedMode(false, true));
    expect(result.current).toBe(false);
  });
});
