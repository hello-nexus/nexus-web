import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetricHistory } from './useMetricHistory';
import type { MetricHistoryQuery, MetricHistoryResponse } from '../api/monitoringHistory';

const fetchMock = vi.fn<(query: MetricHistoryQuery) => Promise<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: MetricHistoryQuery) => fetchMock(query),
}));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-07-16T12:00:00Z').getTime();

function resp(seriesId: string, points: { t: number; avg: number; max: number }[]): MetricHistoryResponse {
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [{ id: seriesId, kind: 'cpu', name: 'CPU', points }] };
}

function emptyResp(): MetricHistoryResponse {
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [] };
}

// Drain the microtask queue inside act so resolved fetch chains land.
const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMetricHistory', () => {
  it('fetches the 7d silhouette and the initial 1h viewport window on mount', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 7 * DAY, to: NOW, maxPoints: 600, series: 'cpu' });
    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - HOUR, to: NOW, maxPoints: 800, series: 'cpu' });
  });

  it('debounces the viewport fetch while dragging, firing once after 200ms with the latest window', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 3 * HOUR, 'drag'); });

    await advance(100);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(150);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 5 * HOUR, to: NOW - 3 * HOUR, maxPoints: 800, series: 'cpu' });
  });

  it('fetches immediately (no debounce) when the brush change phase is end', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 800, series: 'cpu' });
  });

  it('drops a stale viewport response that resolves after a newer request already landed', async () => {
    const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });

    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));

    // A second setRange fires before the first (mount) viewport fetch resolves.
    act(() => { result.current.setRange('3h'); });
    await advance(0);
    await act(async () => {
      first.resolve({ data: resp('cpu', [{ t: NOW, avg: 99, max: 99 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    expect(result.current.series).toEqual([]);
  });

  it('reattaches following on setRange and detaches on a short brush window', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.following).toBe(true);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    act(() => { result.current.setRange('3h'); });
    await advance(0);
    expect(result.current.following).toBe(true);
    expect(result.current.domain).toEqual([NOW - 3 * HOUR, NOW]);
  });

  it('polls the live tail every second while following and appends new points', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW + 1000, avg: 10, max: 12 }]), mocked: false, unsupported: false });
    await advance(1_000);

    const cpu = result.current.series.find(s => s.id === 'cpu');
    expect(cpu?.points).toEqual([{ t: NOW + 1000, avg: 10, max: 12 }]);
    expect(result.current.domain[1]).toBe(NOW + 1000);
  });

  it('drops a stale live-tail response that resolves after a newer poll already landed', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementationOnce(() => first.promise);
    await advance(1_000);

    const second = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementationOnce(() => second.promise);
    await advance(1_000);

    // Newer poll (seq 2) resolves before the older one (seq 1).
    await act(async () => {
      second.resolve({ data: resp('cpu', [{ t: NOW + 2000, avg: 20, max: 22 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    await act(async () => {
      first.resolve({ data: resp('cpu', [{ t: NOW + 1000, avg: 10, max: 12 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    const cpu = result.current.series.find(s => s.id === 'cpu');
    expect(cpu?.points).toEqual([{ t: NOW + 2000, avg: 20, max: 22 }]);
  });

  it('bounds the brush\'s pannable fullDomain to a narrower server retention window', async () => {
    fetchMock.mockResolvedValue({ data: { ...emptyResp(), retentionDays: 2 }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.fullDomain).toEqual([NOW - 2 * DAY, NOW]);
  });

  it('fullDomain defaults to the 7d silhouette window when retention is at least that wide', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.fullDomain).toEqual([NOW - 7 * DAY, NOW]);
  });

  it('does not poll the live tail while detached from following', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    fetchMock.mockClear();
    await advance(3_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes the silhouette and re-decimates the viewport every 60s', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);
    // The redecimate interval bumps fetchEpoch, whose effect schedules its
    // own zero-delay timer for the actual fetch - give it one more tick.
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 600 }));
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 800 }));
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetches for a new metric without resetting the viewport (persists across a metric switch)', async () => {
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistory(true, series),
      { initialProps: { series: 'cpu' } },
    );
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'end'); });
    await advance(0);
    const domainBefore = result.current.domain;
    const followingBefore = result.current.following;

    fetchMock.mockClear();
    rerender({ series: 'gpu,gpu-temp' });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'gpu,gpu-temp' }));
    expect(result.current.domain).toEqual(domainBefore);
    expect(result.current.following).toBe(followingBefore);
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMetricHistory(false, 'cpu'));
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('anchors the live-tail request to the server time base, not the client clock', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(1_000);

    // The client clock has advanced 1s under fake timers, but `to` is the
    // server time base (nowRef, only ever moved by a response's own
    // timestamp - still the bootstrap NOW here) plus a fixed 2-poll-interval
    // margin, not Date.now() read at request time.
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ to: NOW + 2_000, from: NOW - 5_000 + 1 }));
  });

  it('stops all polling once the route reports unsupported, and retry() re-arms it without a duplicate silhouette fetch', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.supported).toBe(false);
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => { result.current.retry(); });
    await advance(0);

    // Exactly the silhouette + viewport pair - retry() resets the gate and
    // lets the silhouette-poll effect fire its own fetch, rather than also
    // calling loadSilhouette directly (which would double it).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops all polling once a real fetch failure sets error, and retry() re-arms it', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    act(() => { result.current.retry(); });
    await advance(0);

    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
