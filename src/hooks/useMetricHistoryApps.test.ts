import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetricHistoryApps } from './useMetricHistoryApps';
import type { MetricHistoryAppsQuery, MetricHistoryAppsResponse } from '../api/monitoringHistoryApps';

const fetchMock = vi.fn<(query: MetricHistoryAppsQuery) => Promise<{ data: MetricHistoryAppsResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringHistoryApps', () => ({
  fetchMonitoringHistoryApps: (query: MetricHistoryAppsQuery) => fetchMock(query),
}));

const NOW = 10_000_000;
const MINUTE = 60_000;

function resp(names: string[]): MetricHistoryAppsResponse {
  return { supported: true, apps: names.map(name => ({ name, avg: 1, max: 1, points: [] })) };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

function deferred() {
  let resolve!: (v: { data: MetricHistoryAppsResponse | null; mocked: boolean; unsupported: boolean }) => void;
  const promise = new Promise<{ data: MetricHistoryAppsResponse | null; mocked: boolean; unsupported: boolean }>(res => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: resp(['chrome.exe']), mocked: false, unsupported: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMetricHistoryApps', () => {
  it('fetches once, debounced, on mount', async () => {
    renderHook(() => useMetricHistoryApps(true, 'cpu', NOW - MINUTE, NOW, true));
    await advance(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - MINUTE, to: NOW, series: 'cpu' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on a same-width tick slide while following', async () => {
    const { rerender } = renderHook(
      ({ from, to }) => useMetricHistoryApps(true, 'cpu', from, to, true),
      { initialProps: { from: NOW - MINUTE, to: NOW } },
    );
    await advance(200);
    fetchMock.mockClear();

    // A live tick slides both edges by the same delta, preserving width.
    rerender({ from: NOW - MINUTE + 1000, to: NOW + 1000 });
    await advance(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetches immediately when the window width changes even while following', async () => {
    const { rerender } = renderHook(
      ({ from, to }) => useMetricHistoryApps(true, 'cpu', from, to, true),
      { initialProps: { from: NOW - MINUTE, to: NOW } },
    );
    await advance(200);
    fetchMock.mockClear();

    // A preset pick or resize changes the width - must refetch, debounced.
    rerender({ from: NOW - 3 * MINUTE, to: NOW });
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches on a same-width change while detached (not following)', async () => {
    const { rerender } = renderHook(
      ({ from, to }) => useMetricHistoryApps(true, 'cpu', from, to, false),
      { initialProps: { from: NOW - 5 * MINUTE, to: NOW - 4 * MINUTE } },
    );
    await advance(200);
    fetchMock.mockClear();

    rerender({ from: NOW - 6 * MINUTE, to: NOW - 5 * MINUTE });
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches immediately on a metric switch while following, even though the shared box width is unchanged', async () => {
    const { rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistoryApps(true, series, NOW - MINUTE, NOW, true),
      { initialProps: { series: 'cpu' } },
    );
    await advance(200);
    fetchMock.mockClear();

    // Same from/to (the shared box is not reset on a tab switch) - only the
    // series param changes, exactly like a cpu -> gpu tab switch.
    rerender({ series: 'gpu:0:1' });
    await advance(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'gpu:0:1' }));
  });

  it('is not ready until the first response for the current series lands, and drops back to not-ready on a metric switch', async () => {
    const first = deferred();
    fetchMock.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistoryApps(true, series, NOW - MINUTE, NOW, true),
      { initialProps: { series: 'cpu' } },
    );
    await advance(200);
    expect(result.current.ready).toBe(false);

    await act(async () => {
      first.resolve({ data: resp(['chrome.exe']), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    expect(result.current.ready).toBe(true);

    const second = deferred();
    fetchMock.mockReturnValueOnce(second.promise);
    rerender({ series: 'gpu:0:1' });
    await advance(200);
    expect(result.current.ready).toBe(false);

    await act(async () => {
      second.resolve({ data: resp(['Nexus']), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    expect(result.current.ready).toBe(true);
  });

  it('polls every ~5s while following, independent of per-tick from/to slides', async () => {
    const { rerender } = renderHook(
      ({ from, to }) => useMetricHistoryApps(true, 'cpu', from, to, true),
      { initialProps: { from: NOW - MINUTE, to: NOW } },
    );
    await advance(200);
    fetchMock.mockClear();

    for (let i = 1; i <= 5; i++) {
      rerender({ from: NOW - MINUTE + i * 1000, to: NOW + i * 1000 });
      await advance(1000);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll on the 5s timer while detached', async () => {
    renderHook(() => useMetricHistoryApps(true, 'cpu', NOW - MINUTE, NOW, false));
    await advance(200);
    fetchMock.mockClear();

    await advance(6000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unsupported on a 404 with no mock available and stops fetching', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result, rerender } = renderHook(
      ({ from, to }) => useMetricHistoryApps(true, 'cpu', from, to, false),
      { initialProps: { from: NOW - MINUTE, to: NOW } },
    );
    await advance(200);
    expect(result.current.supported).toBe(false);

    fetchMock.mockClear();
    rerender({ from: NOW - 2 * MINUTE, to: NOW - MINUTE });
    await advance(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMetricHistoryApps(false, 'cpu', NOW - MINUTE, NOW, true));
    await advance(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears apps and drops ready when disabled after having loaded data, instead of leaving the previous metric rendering', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useMetricHistoryApps(enabled, 'cpu', NOW - MINUTE, NOW, true),
      { initialProps: { enabled: true } },
    );
    await advance(200);
    expect(result.current.apps.length).toBeGreaterThan(0);
    expect(result.current.ready).toBe(true);

    // Mirrors the GPU tab with no resolved adapterLuid: MonitoringPage
    // disables the hook (and its seriesParam empties) rather than switching
    // to a different non-empty series.
    rerender({ enabled: false });
    await advance(0);
    expect(result.current.apps).toEqual([]);
    expect(result.current.ready).toBe(false);
  });

  it('clears apps and drops ready when seriesParam drops to empty even if enabled stays true, and stays clear past the debounce and live-refresh windows', async () => {
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistoryApps(true, series, NOW - MINUTE, NOW, true),
      { initialProps: { series: 'cpu' } },
    );
    await advance(200);
    expect(result.current.apps.length).toBeGreaterThan(0);
    fetchMock.mockClear();

    rerender({ series: '' });
    await advance(0);
    expect(result.current.apps).toEqual([]);
    expect(result.current.ready).toBe(false);

    // The debounced-fetch and live-refresh effects must not silently
    // repopulate stale data once the empty series clears past their own
    // gates - neither fires a fetch at all for an empty series.
    await advance(6_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.apps).toEqual([]);
    expect(result.current.ready).toBe(false);
  });
});
