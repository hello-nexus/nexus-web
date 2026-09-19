import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentApps } from './useRecentApps';
import type { RecentApp } from '../../../api/deck';

const getRecentAppsMock = vi.fn();
const setRecentAppsExcludedMock = vi.fn();
const clearRecentAppsMock = vi.fn();
const activateRecentAppMock = vi.fn();

vi.mock('../../../api/deck', () => ({
  getRecentApps: () => getRecentAppsMock(),
  setRecentAppsExcluded: (keys: string[]) => setRecentAppsExcludedMock(keys),
  clearRecentApps: () => clearRecentAppsMock(),
  activateRecentApp: (key: string) => activateRecentAppMock(key),
}));

const capturedTopics: Record<string, ((data: unknown) => void) | null> = {};
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTopics[topic] = enabled ? cb : null;
  },
}));

const APPS: RecentApp[] = [
  { processKey: 'discord', name: 'Discord', lastFocusedUtcMs: 2 },
  { processKey: 'chrome', name: 'Chrome', lastFocusedUtcMs: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  capturedTopics.deck = null;
  getRecentAppsMock.mockResolvedValue({ apps: APPS, excluded: ['explorer'], focusedProcessKey: 'discord' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRecentApps - initial load', () => {
  it('fetches apps, excluded and the focused key on mount', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.apps).toEqual(APPS);
    expect(result.current.excluded).toEqual(['explorer']);
    expect(result.current.focusedProcessKey).toBe('discord');
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useRecentApps(false));
    await Promise.resolve();
    expect(getRecentAppsMock).not.toHaveBeenCalled();
    expect(capturedTopics.deck).toBeNull();
  });
});

describe('useRecentApps - deck topic', () => {
  it('replaces apps and the focused key on a recents frame', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const nextApps: RecentApp[] = [{ processKey: 'chrome', name: 'Chrome', lastFocusedUtcMs: 3 }];
    act(() => capturedTopics.deck?.({ kind: 'recents', apps: nextApps, focusedProcessKey: 'chrome' }));

    expect(result.current.apps).toEqual(nextApps);
    expect(result.current.focusedProcessKey).toBe('chrome');
  });

  it('ignores a frame of a different kind', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => capturedTopics.deck?.({ kind: 'active', instanceId: 'x' }));

    expect(result.current.apps).toEqual(APPS);
  });
});

describe('useRecentApps - actions', () => {
  it('setExcluded updates state optimistically and persists the whole list', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => { await result.current.setExcluded(['explorer', 'discord']); });

    expect(result.current.excluded).toEqual(['explorer', 'discord']);
    expect(setRecentAppsExcludedMock).toHaveBeenCalledWith(['explorer', 'discord']);
  });

  it('clear empties local apps and calls the delete route', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => { await result.current.clear(); });

    expect(result.current.apps).toEqual([]);
    expect(clearRecentAppsMock).toHaveBeenCalledTimes(1);
  });

  it('activate calls the activate route with the process key', async () => {
    const { result } = renderHook(() => useRecentApps(true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => { await result.current.activate('chrome'); });

    expect(activateRecentAppMock).toHaveBeenCalledWith('chrome');
  });
});
