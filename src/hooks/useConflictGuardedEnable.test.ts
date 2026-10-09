import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConflictGuardedEnable } from './useConflictGuardedEnable';

const mockFetchConflicts = vi.fn();
vi.mock('../api/conflicts', () => ({
  fetchConflicts: () => mockFetchConflicts(),
}));

const lConnect = { id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'L-Connect 3.exe', pid: 7 };

describe('useConflictGuardedEnable', () => {
  beforeEach(() => {
    mockFetchConflicts.mockReset();
    mockFetchConflicts.mockResolvedValue([]);
  });

  it('enables a non-experimental device with no competing app at once', async () => {
    const { result } = renderHook(() => useConflictGuardedEnable());
    const enable = vi.fn();

    await act(() => result.current.requestEnable({ name: 'NP50' }, enable));

    expect(enable).toHaveBeenCalledTimes(1);
    expect(result.current.experimental).toBeNull();
  });

  it('holds an experimental device behind the prompt until confirmed', async () => {
    const { result } = renderHook(() => useConflictGuardedEnable());
    const enable = vi.fn();

    await act(() => result.current.requestEnable({ name: 'Uni Hub', experimental: true }, enable));
    expect(enable).not.toHaveBeenCalled();
    expect(result.current.experimental).not.toBeNull();

    await act(async () => { result.current.confirmExperimental(); });
    expect(enable).toHaveBeenCalledTimes(1);
    expect(result.current.experimental).toBeNull();
  });

  it('drops the enable when the prompt is cancelled', async () => {
    const { result } = renderHook(() => useConflictGuardedEnable());
    const enable = vi.fn();

    await act(() => result.current.requestEnable({ name: 'Uni Hub', experimental: true }, enable));
    act(() => { result.current.cancelExperimental(); });

    expect(enable).not.toHaveBeenCalled();
    expect(result.current.experimental).toBeNull();
  });

  it('checks the competing app once the experimental prompt is confirmed', async () => {
    mockFetchConflicts.mockResolvedValue([lConnect]);
    const { result } = renderHook(() => useConflictGuardedEnable());
    const enable = vi.fn();

    await act(() => result.current.requestEnable({ name: 'Uni Hub', conflictAppId: 'lian-li-l-connect', experimental: true }, enable));
    expect(mockFetchConflicts).not.toHaveBeenCalled();

    await act(async () => { result.current.confirmExperimental(); });
    expect(enable).not.toHaveBeenCalled();
    expect(result.current.pending?.conflict.id).toBe('lian-li-l-connect');
  });
});
