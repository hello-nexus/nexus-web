import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConflictRoster } from './useConflictRoster';
import type { DetectedConflict } from '../api/conflicts';

const icue: DetectedConflict = { id: 'icue', displayName: 'iCUE', category: 'lighting', processName: 'iCUE', pid: 10 };
const signal: DetectedConflict = { id: 'signalrgb', displayName: 'SignalRGB', category: 'lighting', processName: 'SignalRgb', pid: 20 };

describe('useConflictRoster', () => {
  it('keeps an app that stopped running, marked terminated, in its original place', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DetectedConflict[] }) => useConflictRoster(list, true, true),
      { initialProps: { list: [icue, signal] } },
    );
    expect(result.current.entries.map(e => e.terminated)).toEqual([false, false]);

    rerender({ list: [signal] });

    expect(result.current.entries.map(e => e.conflict.id)).toEqual(['icue', 'signalrgb']);
    expect(result.current.entries.map(e => e.terminated)).toEqual([true, false]);
    // The device join keys off this, so an ended app keeps its device list.
    expect(result.current.conflicts).toHaveLength(2);
  });

  it('appends an app that starts while the surface is open', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DetectedConflict[] }) => useConflictRoster(list, true, true),
      { initialProps: { list: [icue] } },
    );
    rerender({ list: [icue, signal] });
    expect(result.current.entries.map(e => e.conflict.id)).toEqual(['icue', 'signalrgb']);
  });

  it('marks an app terminated before the watcher has scanned it away', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DetectedConflict[] }) => useConflictRoster(list, true, true),
      { initialProps: { list: [icue] } },
    );
    act(() => { result.current.markTerminated('icue'); });
    expect(result.current.entries[0].terminated).toBe(true);

    // Still listed by the watcher's stale snapshot: the mark must hold.
    rerender({ list: [icue] });
    expect(result.current.entries[0].terminated).toBe(true);

    // Gone from the live list: still terminated.
    rerender({ list: [] });
    expect(result.current.entries[0].terminated).toBe(true);
  });

  it('clears the terminated mark when the app comes back under a new pid', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: DetectedConflict[] }) => useConflictRoster(list, true, true),
      { initialProps: { list: [icue] } },
    );
    act(() => { result.current.markTerminated('icue'); });
    rerender({ list: [{ ...icue, pid: 99 }] });

    expect(result.current.entries[0].terminated).toBe(false);
    expect(result.current.entries[0].conflict.pid).toBe(99);
  });

  it('holds every row while the snapshot is unresolved, so a service drop is not read as apps exiting', () => {
    const { result, rerender } = renderHook(
      ({ list, ready }: { list: DetectedConflict[]; ready: boolean }) => useConflictRoster(list, true, ready),
      { initialProps: { list: [icue, signal], ready: true } },
    );
    // The feed went away: an empty list is not evidence anything ended.
    rerender({ list: [], ready: false });

    expect(result.current.entries.map(e => e.conflict.id)).toEqual(['icue', 'signalrgb']);
    expect(result.current.entries.map(e => e.terminated)).toEqual([false, false]);

    // Back online with one app really gone: only that row goes terminated.
    rerender({ list: [signal], ready: true });
    expect(result.current.entries.map(e => e.terminated)).toEqual([true, false]);
  });

  it('resets when the surface closes so the next open starts from live state', () => {
    const { result, rerender } = renderHook(
      ({ list, active }: { list: DetectedConflict[]; active: boolean }) => useConflictRoster(list, active, true),
      { initialProps: { list: [icue], active: true } },
    );
    rerender({ list: [], active: false });
    expect(result.current.entries).toEqual([]);

    rerender({ list: [signal], active: true });
    expect(result.current.entries.map(e => e.conflict.id)).toEqual(['signalrgb']);
  });
});
