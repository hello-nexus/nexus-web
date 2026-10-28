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

import { useOobeRestricted } from './useOobeRestricted';

describe('useOobeRestricted', () => {
  beforeEach(() => { frame = null; topic.mockClear(); });

  it('is false until a frame arrives', () => {
    const { result } = renderHook(() => useOobeRestricted(true));
    expect(result.current).toBe(false);
    expect(topic).toHaveBeenCalledWith('system/session', true);
  });

  it('follows the oobe flag on each frame', () => {
    const { result } = renderHook(() => useOobeRestricted(true));
    act(() => frame?.({ oobe: true }));
    expect(result.current).toBe(true);
    act(() => frame?.({ oobe: false }));
    expect(result.current).toBe(false);
  });

  it('ignores a malformed frame', () => {
    const { result } = renderHook(() => useOobeRestricted(true));
    act(() => frame?.({ oobe: true }));
    act(() => frame?.(null));
    expect(result.current).toBe(false);
  });

  it('never restricts a surface that did not opt in', () => {
    const { result } = renderHook(() => useOobeRestricted(false));
    expect(frame).toBeNull();
    expect(result.current).toBe(false);
  });
});
