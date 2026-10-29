import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markLightingRestart } from '../lib/postRestartRoute';
import { useReturnToLightingAfterRestart } from './useReturnToLightingAfterRestart';

beforeEach(() => localStorage.clear());

describe('useReturnToLightingAfterRestart', () => {
  it('navigates to Lighting when a fresh window finds a recent mark', () => {
    markLightingRestart();
    const go = vi.fn();
    const { rerender } = renderHook(({ online }) => useReturnToLightingAfterRestart(online, go), { initialProps: { online: false } });
    expect(go).not.toHaveBeenCalled();
    rerender({ online: true });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('does not navigate on a reconnect in a window that was already online', () => {
    const go = vi.fn();
    const { rerender } = renderHook(({ online }) => useReturnToLightingAfterRestart(online, go), { initialProps: { online: true } });
    markLightingRestart();
    rerender({ online: false });
    rerender({ online: true });
    expect(go).not.toHaveBeenCalled();
  });

  it('ignores a stale mark', () => {
    markLightingRestart(Date.now() - 10 * 60_000);
    const go = vi.fn();
    renderHook(() => useReturnToLightingAfterRestart(true, go));
    expect(go).not.toHaveBeenCalled();
  });
});
