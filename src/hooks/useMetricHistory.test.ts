import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetricHistory } from './useMetricHistory';
import type { MetricHistoryQuery, MetricHistoryResponse } from '../api/monitoringHistory';

const fetchMock = vi.fn<(query: MetricHistoryQuery) => Promise<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: MetricHistoryQuery) => fetchMock(query),
}));

const MINUTE = 60_000;
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
  it('fetches the 30m strip silhouette and the 5m box (a sixth) on mount (default preset)', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // Silhouette (maxPoints=400) covers the full 30m strip.
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 30 * MINUTE, to: NOW, series: 'cpu', maxPoints: 400 }));
    // Viewport (maxPoints=800) covers only the box: the last 5m (a sixth).
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 5 * MINUTE, to: NOW, series: 'cpu', maxPoints: 800 }));
  });

  it('debounces the full-resolution (800pt) viewport fetch while dragging, firing once after the trailing debounce with the latest window', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 3 * HOUR, 'drag'); });

    await advance(100);
    expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 800)).toBe(false);

    await advance(150);
    const fineCalls = fetchMock.mock.calls.filter(([q]) => q.maxPoints === 800);
    expect(fineCalls.length).toBe(1);
    expect(fineCalls[0][0]).toEqual({ from: NOW - 5 * HOUR, to: NOW - 3 * HOUR, maxPoints: 800, series: 'cpu' });
  });

  describe('drag-time live rendering (item 29)', () => {
    it('renders synchronously from cache/silhouette on every drag event, with no fetch required', async () => {
      // Seed the cache with a real box fetch for a window overlapping the
      // upcoming drag target, so the synchronous render has something to
      // slice from.
      fetchMock.mockResolvedValue({
        data: resp('cpu', [{ t: NOW - 5 * HOUR, avg: 11, max: 11 }, { t: NOW - 3 * HOUR, avg: 22, max: 22 }]),
        mocked: false, unsupported: false,
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 3 * HOUR, 'end'); });
      await advance(0);

      fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves - proves the render is NOT fetch-driven
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });

      // Sliced synchronously from the cached window landed above - no await.
      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 5 * HOUR, avg: 11, max: 11 }]);
    });

    it('fires a throttled coarse (100pt) fetch during the drag, refining the synchronous render', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({
        data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 33, max: 33 }]), mocked: false, unsupported: false,
      });

      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
      await advance(0);

      const coarseCalls = fetchMock.mock.calls.filter(([q]) => q.maxPoints === 100);
      expect(coarseCalls.length).toBe(1);
      expect(coarseCalls[0][0]).toEqual({ from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 100, series: 'cpu' });
      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 4 * HOUR, avg: 33, max: 33 }]);
    });

    it('throttles the coarse fetch to one in flight, chasing directly to the LATEST window once it resolves (not replaying every intermediate one)', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();

      const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
      fetchMock.mockReturnValueOnce(first.promise);
      fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });

      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
      // Two more drag events land while the first coarse fetch is still pending.
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 3 * HOUR, 'drag'); });
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'drag'); });

      expect(fetchMock.mock.calls.filter(([q]) => q.maxPoints === 100).length).toBe(1);

      await act(async () => {
        first.resolve({ data: emptyResp(), mocked: false, unsupported: false });
        await Promise.resolve();
      });

      const coarseCalls = fetchMock.mock.calls.filter(([q]) => q.maxPoints === 100);
      expect(coarseCalls.length).toBe(2);
      expect(coarseCalls[1][0]).toEqual({ from: NOW - 5 * HOUR, to: NOW - 2 * HOUR, maxPoints: 100, series: 'cpu' });
    });

    it('discards a coarse response that resolves after the drag already ended, so it cannot clobber the settled fine render', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();

      const coarse = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
      fetchMock.mockReturnValueOnce(coarse.promise);
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });

      fetchMock.mockResolvedValue({
        data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 99, max: 99 }]), mocked: false, unsupported: false,
      });
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
      await advance(0);
      const settledPoints = result.current.series.find(s => s.id === 'cpu')?.points;

      // The stale coarse fetch (from before the release) finally resolves.
      await act(async () => {
        coarse.resolve({ data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 1, max: 1 }]), mocked: false, unsupported: false });
        await Promise.resolve();
      });

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual(settledPoints);
    });

    it('never applies a coarse response for an EARLIER drag target once the user has dragged further, even though the phase is still \'drag\' throughout', async () => {
      // Checking only lastPhaseRef==='drag' is not enough to prove
      // freshness: the phase stays 'drag' across multiple drag events, so a
      // fetch for an abandoned window resolving after the user has already
      // moved on must be rejected by comparing against the actual current
      // target, not just the phase.
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();

      const forA = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
      fetchMock.mockReturnValueOnce(forA.promise);
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });

      // A second drag lands before A's coarse fetch resolves - throttled to
      // one in flight, so C's own fetch is only queued, never started yet.
      const forC = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
      fetchMock.mockReturnValueOnce(forC.promise);
      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'drag'); });

      // A's stale response resolves - C's own fetch (queued next) is left
      // pending throughout, isolating this assertion to A's effect alone.
      await act(async () => {
        forA.resolve({ data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 1, max: 1 }]), mocked: false, unsupported: false });
        await Promise.resolve();
      });

      const avgs = (result.current.series.find(s => s.id === 'cpu')?.points ?? []).map(p => p.avg);
      expect(avgs).not.toContain(1);
    });
  });

  it('fetches immediately (no debounce) when the brush change phase is end', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 800, series: 'cpu' });
  });

  it('brushChange moves only the box - the strip (and its silhouette fetch) is untouched', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);

    expect(result.current.stripDomain).toEqual([NOW - 30 * MINUTE, NOW]);
    expect(result.current.domain).toEqual([NOW - 4 * MINUTE, NOW - MINUTE]);
    // Only the box's own maxPoints=800 fetch fired - no maxPoints=400 (silhouette) call.
    expect(fetchMock.mock.calls.every(([q]) => q.maxPoints !== 400)).toBe(true);
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

  it('setRange sizes the strip to the preset and the box to a sixth of it, right-edge anchored', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.following).toBe(true);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    act(() => { result.current.setRange('3h'); });
    await advance(0);
    expect(result.current.following).toBe(true);
    expect(result.current.stripDomain).toEqual([NOW - 3 * HOUR, NOW]);
    expect(result.current.domain).toEqual([NOW - 30 * MINUTE, NOW]);
    expect(result.current.rangeKey).toBe('3h');
    expect(result.current.lastPresetKey).toBe('3h');
  });

  it('onChartDragSelect sets the box to the exact selection, goes custom, and re-derives the strip', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    const selFrom = NOW - 90 * MINUTE;
    const selTo = NOW - 60 * MINUTE;
    act(() => { result.current.onChartDragSelect(selFrom, selTo); });
    await advance(0);

    expect(result.current.domain).toEqual([selFrom, selTo]);
    expect(result.current.rangeKey).toBe('custom');
    expect(result.current.lastPresetKey).toBe('3h');
    expect(result.current.following).toBe(false);
    const [stripFrom, stripTo] = result.current.stripDomain;
    expect(stripTo - stripFrom).toBe(3 * HOUR);
  });

  it('backToLive re-anchors box and strip to now, keeping their widths and rangeKey', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * HOUR, NOW - 3 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    act(() => { result.current.backToLive(); });
    await advance(0);

    expect(result.current.following).toBe(true);
    expect(result.current.domain).toEqual([NOW - HOUR, NOW]);
    expect(result.current.stripDomain).toEqual([NOW - 3 * HOUR, NOW]);
    expect(result.current.rangeKey).toBe('3h');
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
    // The strip slides in lockstep with the box while following.
    expect(result.current.stripDomain[1]).toBe(NOW + 1000);
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

  it('clamps the strip to a narrower server retention window', async () => {
    fetchMock.mockResolvedValue({ data: { ...emptyResp(), retentionDays: 2 }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('7d'); });
    await advance(0);

    expect(result.current.stripDomain[0]).toBe(NOW - 2 * DAY);
  });

  it('keeps polling the live tail while detached (to track real time for backToLive) but does not mutate the displayed series', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);
    const domainBefore = result.current.domain;

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW + 1000, avg: 10, max: 12 }]), mocked: false, unsupported: false });
    await advance(1_000);

    // The tail poll still fired (it must, to keep the server-time base
    // fresh), but the detached viewport's own domain/series are untouched.
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.domain).toEqual(domainBefore);
    expect(result.current.series.find(s => s.id === 'cpu')?.points ?? []).not.toContainEqual({ t: NOW + 1000, avg: 10, max: 12 });
  });

  it('backToLive re-anchors to the actual current time even after a long detached browse, not the moment following was dropped', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    // Real time keeps advancing (via the background tail poll) for 10s while detached.
    fetchMock.mockImplementation(async (q: MetricHistoryQuery) => ({
      data: resp('cpu', [{ t: q.to - 1, avg: 5, max: 5 }]),
      mocked: false, unsupported: false,
    }));
    await advance(10_000);

    act(() => { result.current.backToLive(); });
    await advance(0);

    // Reattaching lands within a couple of ticks of the advanced time, not
    // frozen at the original detach moment (NOW).
    expect(result.current.domain[1]).toBeGreaterThan(NOW + 5_000);
  });

  it('refreshes the box every 60s regardless of following/dragging', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);
    // The redecimate interval bumps fetchEpoch, whose effect schedules its
    // own zero-delay timer for the actual fetch - give it one more tick.
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 800 }));
  });

  it('refreshes the strip silhouette every 60s while following', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 400 }));
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

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
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

    // Exactly the silhouette + box pair - retry() resets the gate and lets
    // the silhouette-poll effect fire its own fetch, rather than also
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

  it('does not refetch the viewport on a metric switch once the route is known unsupported', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistory(true, series),
      { initialProps: { series: 'cpu' } },
    );
    await advance(0);
    expect(result.current.supported).toBe(false);

    fetchMock.mockClear();
    rerender({ series: 'gpu,gpu-temp' });
    await advance(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a late tail response that resolves after a fresher viewport refresh does not regress the series', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // Tail tick fires; hold its response pending.
    const tailDeferred = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementationOnce(() => tailDeferred.promise);
    await advance(1_000);

    // A viewport refresh (setRange) lands first, with a newer point than the
    // still-pending tail request will eventually resolve with.
    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW + 5_000, avg: 90, max: 92 }]), mocked: false, unsupported: false });
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW + 5_000, avg: 90, max: 92 }]);

    // The stale tail request (an older point) finally resolves.
    await act(async () => {
      tailDeferred.resolve({ data: resp('cpu', [{ t: NOW + 500, avg: 10, max: 12 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    // Dropped - the fresher viewport refresh invalidated it, so it never
    // appends the older point after the newer one.
    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW + 5_000, avg: 90, max: 92 }]);
  });

  it('exposes the viewport response\'s stepSeconds', async () => {
    fetchMock.mockResolvedValue({ data: { ...emptyResp(), stepSeconds: 30 }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    expect(result.current.stepSeconds).toBe(30);
  });

  it('viewportGeneration bumps on a real navigation action but not on a live-follow tick', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    const gen0 = result.current.viewportGeneration;

    await advance(1_000);
    expect(result.current.viewportGeneration).toBe(gen0);

    act(() => { result.current.setRange('3h'); });
    await advance(0);
    expect(result.current.viewportGeneration).toBeGreaterThan(gen0);
  });

  it('viewportGeneration is not bumped by the 60s redecimate timer while idly watching live', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    const gen0 = result.current.viewportGeneration;

    // The redecimate timer bumps the internal fetch-retry counter every 60s
    // regardless of navigation - viewportGeneration must stay untouched by
    // it, or a caller keyed on it (e.g. the process list's rank-stability
    // reset trigger) would force a full re-rank every 60s while the user is
    // just watching, not navigating.
    await advance(60_000);
    await advance(0);
    expect(result.current.viewportGeneration).toBe(gen0);

    act(() => { result.current.retry(); });
    await advance(0);
    expect(result.current.viewportGeneration).toBeGreaterThan(gen0);
  });

  it('renders instantly from cache on an exact-key revisit while the revalidating fetch is in flight', async () => {
    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]);

    // Scrub away, then back to the exact same window - a slow/never-resolving
    // fetch for the revisit must not blank the chart: the cached response
    // from the first visit renders immediately.
    const pending = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    act(() => { result.current.onBrushChange(NOW - 8 * HOUR, NOW - 7 * HOUR, 'end'); });
    await advance(0);
    fetchMock.mockImplementationOnce(() => pending.promise);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    // The debounced viewport effect's own (0-delay) timer runs the interim
    // cache-render synchronously before it awaits the now-pending fetch.
    await advance(0);

    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]);
  });

  it('idle-prefetches the same-width left-neighbor window after the viewport settles', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);
    fetchMock.mockClear();

    await advance(3_500);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 6 * HOUR, to: NOW - 5 * HOUR }));
  });
});
