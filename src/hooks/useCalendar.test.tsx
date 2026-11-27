import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplexContext, type MultiplexContextValue } from './useMultiplexSocket';
import { invalidateCalendar, resetCalendarStore, useCalendarEvents, useCalendarSettings, useCalendarSources } from './useCalendar';

const api = vi.hoisted(() => ({
  fetchCalendarSources: vi.fn(),
  fetchCalendarSettings: vi.fn(),
  fetchCalendarEvents: vi.fn(),
  postCalendarRefresh: vi.fn(),
  putCalendarRefreshMinutes: vi.fn(),
}));

vi.mock('../api/calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/calendar')>();
  return { ...actual, ...api, subscribeCalendarMock: () => () => {}, addCalendarSource: vi.fn(), removeCalendarSource: vi.fn(), updateCalendarSource: vi.fn() };
});

const dto = (id: string, calendarId: string) => ({
  id, calendarId, title: id, location: null, notes: null, allDay: false, start: 1000, end: 2000,
  startDate: null, endDate: null, status: 'confirmed' as const, providerId: null, etag: null,
});

const listeners = new Map<string, Set<(raw: unknown) => void>>();
const multiplex = {
  subscribe: (topic: string, fn: (raw: unknown) => void) => {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(fn);
  },
  unsubscribe: (topic: string, fn: (raw: unknown) => void) => { listeners.get(topic)?.delete(fn); },
  connected: true,
} as unknown as MultiplexContextValue;

const wrapper = ({ children }: { children: ReactNode }) => (
  <MultiplexContext.Provider value={multiplex}>{children}</MultiplexContext.Provider>
);

beforeEach(() => {
  resetCalendarStore();
  listeners.clear();
  api.fetchCalendarSources.mockResolvedValue([{ id: 'a', kind: 'ics', name: 'A', color: '#fff', host: null, lastSyncedAt: null, status: 'ok', error: null }]);
  api.fetchCalendarSettings.mockResolvedValue({ refreshMinutes: 15, lastSyncedAt: null, syncing: false });
  api.fetchCalendarEvents.mockResolvedValue({ events: [dto('e1', 'a'), dto('e2', 'b')], syncedAt: 5 });
});

afterEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
});

describe('calendar store ordering and cache', () => {
  const deferred = () => {
    let resolve!: (v: unknown) => void;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
  };

  it('never lets an older response overwrite a newer one', async () => {
    const slow = deferred();
    api.fetchCalendarEvents.mockReset();
    api.fetchCalendarEvents.mockImplementationOnce(() => slow.promise);
    api.fetchCalendarEvents.mockResolvedValue({ events: [dto('new', 'a')], syncedAt: 2 });
    const { result } = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { invalidateCalendar(); });
    await waitFor(() => expect(result.current.events.map(e => e.id)).toEqual(['new']));
    await act(async () => { slow.resolve({ events: [dto('old', 'a')], syncedAt: 1 }); await Promise.resolve(); });
    expect(result.current.events.map(e => e.id)).toEqual(['new']);
  });

  it('refetches a range that went stale while off screen, when it is viewed again', async () => {
    const first = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    first.unmount();
    api.fetchCalendarEvents.mockClear();
    api.fetchCalendarEvents.mockResolvedValue({ events: [dto('fresh', 'a')], syncedAt: 9 });
    await act(async () => { invalidateCalendar(); });
    expect(api.fetchCalendarEvents).not.toHaveBeenCalledWith(0, 100);
    const again = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(again.result.current.events.map(e => e.id)).toEqual(['fresh']));
  });

  it('does not evict a range whose fetch is still in flight', async () => {
    const slow = deferred();
    api.fetchCalendarEvents.mockImplementationOnce(() => slow.promise);
    renderHook(() => useCalendarEvents(5000, 5100), { wrapper }).unmount();
    for (let i = 0; i < 14; i++) {
      api.fetchCalendarEvents.mockResolvedValueOnce({ events: [], syncedAt: 1 });
      const { result, unmount } = renderHook(() => useCalendarEvents(i * 10, i * 10 + 5), { wrapper });
      await waitFor(() => expect(result.current.loaded).toBe(true));
      unmount();
    }
    const back = renderHook(() => useCalendarEvents(5000, 5100), { wrapper });
    await act(async () => { slow.resolve({ events: [dto('late', 'a')], syncedAt: 3 }); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(back.result.current.loaded).toBe(true));
    expect(back.result.current.events.map(e => e.id)).toEqual(['late']);
  });

  it('drops the result of a non-viewed fetch that an invalidate overtook', async () => {
    const slow = deferred();
    api.fetchCalendarEvents.mockImplementationOnce(() => slow.promise);
    renderHook(() => useCalendarEvents(7000, 7100), { wrapper }).unmount();
    await act(async () => { invalidateCalendar(); });
    api.fetchCalendarEvents.mockResolvedValue({ events: [dto('fresh', 'a')], syncedAt: 5 });
    await act(async () => { slow.resolve({ events: [dto('stale', 'a')], syncedAt: 1 }); await Promise.resolve(); await Promise.resolve(); });
    const back = renderHook(() => useCalendarEvents(7000, 7100), { wrapper });
    await waitFor(() => expect(back.result.current.events.map(e => e.id)).toEqual(['fresh']));
  });

  it('carries the truncated flag from the service', async () => {
    api.fetchCalendarEvents.mockResolvedValue({ events: [], syncedAt: 1, truncated: true });
    const { result } = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(result.current.truncated).toBe(true));
  });

  it('evicts the oldest unviewed ranges past the cache cap', async () => {
    for (let i = 0; i < 15; i++) {
      const { result, unmount } = renderHook(() => useCalendarEvents(i * 1000, i * 1000 + 100), { wrapper });
      await waitFor(() => expect(result.current.loaded).toBe(true));
      unmount();
    }
    api.fetchCalendarEvents.mockClear();
    const { result } = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(api.fetchCalendarEvents).toHaveBeenCalledWith(0, 100));
    expect(result.current).toBeTruthy();
  });
});

describe('calendar store', () => {
  it('makes one request per range however many consumers read it', async () => {
    const { result } = renderHook(() => ({
      one: useCalendarEvents(0, 100),
      two: useCalendarEvents(0, 100),
      sources: useCalendarSources(),
    }), { wrapper });
    await waitFor(() => expect(result.current.one.loaded).toBe(true));
    expect(api.fetchCalendarEvents).toHaveBeenCalledTimes(1);
    expect(result.current.two.events).toHaveLength(2);
    expect(result.current.sources.sources).toHaveLength(1);
  });

  it('drops hidden calendars client-side without another request', async () => {
    const { result } = renderHook(() => useCalendarEvents(0, 100, ['b']), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.events.map(e => e.id)).toEqual(['e1']);
    expect(api.fetchCalendarEvents).toHaveBeenCalledTimes(1);
  });

  it('refetches the canonical resources when a calendar frame arrives', async () => {
    const { result } = renderHook(() => ({ events: useCalendarEvents(0, 100), sources: useCalendarSources() }), { wrapper });
    await waitFor(() => expect(result.current.events.loaded).toBe(true));
    api.fetchCalendarEvents.mockResolvedValue({ events: [dto('e3', 'a')], syncedAt: 9 });
    await act(async () => { listeners.get('calendar')?.forEach(fn => fn({ revision: 2 })); });
    await waitFor(() => expect(result.current.events.events.map(e => e.id)).toEqual(['e3']));
    expect(api.fetchCalendarSources).toHaveBeenCalledTimes(2);
  });

  it('coalesces invalidations from the same tick into one refetch', async () => {
    const { result } = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    api.fetchCalendarEvents.mockClear();
    await act(async () => { invalidateCalendar(); invalidateCalendar(); invalidateCalendar(); });
    await waitFor(() => expect(api.fetchCalendarEvents).toHaveBeenCalledTimes(1));
  });

  it('keeps the loaded events when a refetch fails', async () => {
    const { result } = renderHook(() => useCalendarEvents(0, 100), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    api.fetchCalendarEvents.mockRejectedValue(new Error('offline'));
    await act(async () => { invalidateCalendar(); });
    await waitFor(() => expect(api.fetchCalendarEvents).toHaveBeenCalledTimes(2));
    expect(result.current.events).toHaveLength(2);
  });

  it('does nothing while disabled', async () => {
    renderHook(() => useCalendarEvents(0, 100, [], false), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(api.fetchCalendarEvents).not.toHaveBeenCalled();
    expect(api.fetchCalendarSources).not.toHaveBeenCalled();
    expect(listeners.get('calendar')?.size ?? 0).toBe(0);
  });

  it('shares the refresh interval and resyncs after a manual refresh', async () => {
    api.putCalendarRefreshMinutes.mockResolvedValue({ refreshMinutes: 30, lastSyncedAt: null, syncing: false });
    api.postCalendarRefresh.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCalendarSettings(), { wrapper });
    await waitFor(() => expect(result.current.settings?.refreshMinutes).toBe(15));
    await act(async () => { await result.current.setRefreshMinutes(30); });
    expect(result.current.settings?.refreshMinutes).toBe(30);
    api.fetchCalendarSettings.mockClear();
    await act(async () => { await result.current.refreshNow(); });
    expect(api.postCalendarRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.fetchCalendarSettings).toHaveBeenCalledTimes(1));
  });
});
