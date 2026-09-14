import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConflictResolveAll } from './useConflictResolveAll';
import type { ConflictRosterEntry } from './useConflictRoster';

const mockKill = vi.fn();
vi.mock('../api/conflicts', () => ({
  killConflict: (...args: unknown[]) => mockKill(...args),
}));

const icue = { id: 'icue', displayName: 'iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 1 };
const cam = { id: 'cam', displayName: 'CAM', category: 'lighting', processName: 'CAM.exe', pid: 2 };
const entries: ConflictRosterEntry[] = [
  { conflict: icue, terminated: false },
  { conflict: cam, terminated: true },
];
const autostart = new Map([
  ['icue', [{ kind: 'service', entryName: 'CorsairService' }]],
  ['cam', []],
]);

beforeEach(() => {
  mockKill.mockReset();
  mockKill.mockResolvedValue({ error: false, msg: 'Ok', killed: true });
});

describe('useConflictResolveAll', () => {
  it('ends only the running apps and disables only the apps with boot entries', async () => {
    const markTerminated = vi.fn();
    const disable = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useConflictResolveAll(entries, markTerminated, autostart, disable));
    expect(result.current.pending).toBe(true);

    let ok = false;
    await act(async () => { ok = await result.current.resolveAll(); });

    expect(ok).toBe(true);
    expect(mockKill).toHaveBeenCalledTimes(1);
    expect(mockKill).toHaveBeenCalledWith('icue');
    expect(markTerminated).toHaveBeenCalledWith('icue');
    expect(disable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledWith('icue');
    expect(result.current.autostartDisabledIds.has('icue')).toBe(true);
  });

  it('reports false when a kill or a disable did not stick, and marks nothing ended', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'Ok', killed: false });
    const markTerminated = vi.fn();
    const disable = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useConflictResolveAll(entries, markTerminated, autostart, disable));

    let ok = true;
    await act(async () => { ok = await result.current.resolveAll(); });

    expect(ok).toBe(false);
    expect(markTerminated).not.toHaveBeenCalled();
    expect(result.current.autostartDisabledIds.size).toBe(0);
  });

  it('has nothing pending once every row is ended and no entry remains', () => {
    const done: ConflictRosterEntry[] = [{ conflict: icue, terminated: true }];
    const { result } = renderHook(() => useConflictResolveAll(done, vi.fn(), new Map([['icue', []]]), vi.fn()));
    expect(result.current.pending).toBe(false);
  });
});
