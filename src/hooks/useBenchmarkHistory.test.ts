import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBenchmarkHistory } from './useBenchmarkHistory';
import type { BenchmarkResult } from '../types/benchmark';

const result = {
  composite: 2076,
  scoringVersion: 'v2.2-2026.07',
  cpu: { score: 1907 },
  gpu: { score: 5920 },
  ram: { score: 1312 },
  storage: { score: 1255 },
  hardware: { cpuModel: 'AMD Ryzen 7 9800X3D', gpuModels: ['NVIDIA GeForce RTX 5080'] },
} as unknown as BenchmarkResult;

describe('useBenchmarkHistory', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the leaderboard standing with the saved run and restores it from storage', () => {
    const { result: hook } = renderHook(() => useBenchmarkHistory());
    act(() => hook.current.addRun(result, 'sub-1', { percentile: 60, rank: 41, total: 100 }));
    expect(hook.current.latest).toMatchObject({
      submissionId: 'sub-1',
      submission: { percentile: 60, rank: 41, total: 100 },
    });

    const { result: reloaded } = renderHook(() => useBenchmarkHistory());
    expect(reloaded.current.latest?.submission).toEqual({ percentile: 60, rank: 41, total: 100 });
  });

  it('stores null when the run was not submitted', () => {
    const { result: hook } = renderHook(() => useBenchmarkHistory());
    act(() => hook.current.addRun(result, null));
    expect(hook.current.latest?.submission).toBeNull();
  });

  it('clears a removed entry from its run and from storage', () => {
    const { result: hook } = renderHook(() => useBenchmarkHistory());
    act(() => { hook.current.addRun(result, 'sub-1', { percentile: 60, rank: 41, total: 100 }); });
    act(() => { hook.current.addRun(result, 'sub-2', { percentile: 70, rank: 30, total: 100 }); });

    act(() => hook.current.clearRunSubmission('sub-1'));
    expect(hook.current.history.map(run => run.submissionId)).toEqual(['sub-2', null]);
    expect(hook.current.history[1].submission).toBeNull();

    const { result: reloaded } = renderHook(() => useBenchmarkHistory());
    expect(reloaded.current.history.map(run => run.submissionId)).toEqual(['sub-2', null]);
  });

  it('persists a dismissed publish prompt on its run across reloads', () => {
    const { result: hook } = renderHook(() => useBenchmarkHistory());
    let id = '';
    act(() => { id = hook.current.addRun(result, null); });
    act(() => { hook.current.dismissRunPublish(id); });
    expect(hook.current.latest?.publishDismissed).toBe(true);

    const { result: reloaded } = renderHook(() => useBenchmarkHistory());
    expect(reloaded.current.latest?.publishDismissed).toBe(true);
  });

  it('fills in a deferred upload on the matching run without adding a new entry', () => {
    const { result: hook } = renderHook(() => useBenchmarkHistory());
    let id = '';
    act(() => { id = hook.current.addRun(result, null); });
    expect(hook.current.history).toHaveLength(1);

    act(() => hook.current.updateRunSubmission(id, 'sub-9', { percentile: 71, rank: 12, total: 50 }));
    expect(hook.current.history).toHaveLength(1);
    expect(hook.current.latest).toMatchObject({
      submissionId: 'sub-9',
      submission: { percentile: 71, rank: 12, total: 50 },
    });
  });
});
