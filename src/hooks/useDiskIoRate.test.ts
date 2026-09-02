import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiskIoRate } from './useDiskIoRate';
import type { MetricHistoryFetchResult, MetricHistoryQuery, MetricHistoryResponse } from '../api/monitoringHistory';

const fetchMock = vi.fn<(query: MetricHistoryQuery) => Promise<MetricHistoryFetchResult>>();
vi.mock('../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: MetricHistoryQuery) => fetchMock(query),
}));

// The hook subscribes to exactly one topic ('monitoring/history-tail'),
// mirroring useStreamDecks.test.ts's capture idiom. mockConnected backs
// useMultiplex()?.connected for the reconnect-refetch tests.
let capturedTailPush: ((data: unknown) => void) | null = null;
let mockConnected = true;
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTailPush = enabled ? cb : null;
  },
  useMultiplex: () => ({ connected: mockConnected }),
}));

function resp(readAvg: number, writeAvg: number): MetricHistoryFetchResult {
  return {
    mocked: false,
    unsupported: false,
    data: {
      supported: true,
      retentionDays: 7,
      stepSeconds: 1,
      series: [
        { id: 'disk-read', kind: 'disk', name: 'Disk Read', points: [{ t: 1, avg: readAvg, max: readAvg }] },
        { id: 'disk-write', kind: 'disk', name: 'Disk Write', points: [{ t: 1, avg: writeAvg, max: writeAvg }] },
      ],
    },
  };
}

/** A 'monitoring/history-tail' push frame - series omitted from `values`
 *  carry empty points, matching a series with no fresh value that tick. */
function tailFrame(values: Partial<Record<'disk-read' | 'disk-write', number>>): MetricHistoryResponse {
  const seriesFor = (id: 'disk-read' | 'disk-write') => ({
    id, kind: 'disk' as const, name: id,
    points: id in values ? [{ t: 1, avg: values[id]!, max: values[id]! }] : [],
  });
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [seriesFor('disk-read'), seriesFor('disk-write')] };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(resp(100, 50));
  capturedTailPush = null;
  mockConnected = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useDiskIoRate', () => {
  it('fetches disk-read,disk-write once on mount and reports the summed rate, independent of any active tab', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'disk-read,disk-write' }));
    expect(result.current).toBe(150);
  });

  it('reports 0 and does not fetch while disabled', async () => {
    const { result } = renderHook(() => useDiskIoRate(false));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });

  it('drops a stale bootstrap response superseded by a newer one', async () => {
    let resolveFirst!: (v: MetricHistoryFetchResult) => void;
    fetchMock.mockImplementationOnce(() => new Promise(res => { resolveFirst = res; }));

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDiskIoRate(enabled),
      { initialProps: { enabled: true } },
    );
    await flush();
    expect(result.current).toBe(0);
    // Request A is in flight.

    fetchMock.mockResolvedValueOnce(resp(200, 200));
    // Toggled off then back on before A resolves - the reconnect trigger
    // can no longer overlap a still-in-flight bootstrap, so an
    // enabled-toggle is used instead to fire request B.
    rerender({ enabled: false });
    rerender({ enabled: true });
    await flush();
    expect(result.current).toBe(400);

    // The FIRST (older, now-stale) request resolves late - it must not
    // regress the already-newer value.
    resolveFirst(resp(10, 10));
    await flush();
    expect(result.current).toBe(400);
  });

  it('updates the rate from a live-tail push with zero fetches after bootstrap', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    fetchMock.mockClear();

    act(() => { capturedTailPush?.(tailFrame({ 'disk-read': 300, 'disk-write': 40 })); });

    expect(result.current).toBe(340);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the value unchanged when a pushed frame has empty points for both disk series', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(result.current).toBe(150);

    act(() => { capturedTailPush?.(tailFrame({})); });

    expect(result.current).toBe(150);
  });

  it('updates only the half with a fresh point, carrying the other half forward', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(result.current).toBe(150); // read=100, write=50

    act(() => { capturedTailPush?.(tailFrame({ 'disk-read': 500 })); }); // write has no point this tick

    expect(result.current).toBe(550); // 500 + carried-forward 50
  });

  it('reconnect triggers exactly one refetch', async () => {
    const { rerender } = renderHook(() => useDiskIoRate(true));
    await flush();
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'disk-read,disk-write' }));
  });

  it('does not refetch on a steady connection - only on an actual drop-then-reconnect', async () => {
    const { rerender } = renderHook(() => useDiskIoRate(true));
    await flush();
    fetchMock.mockClear();

    rerender(); // connected stays true throughout - no edge to react to
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops the subscription and clears the rate on disable', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDiskIoRate(enabled),
      { initialProps: { enabled: true } },
    );
    await flush();
    expect(result.current).toBe(150);

    rerender({ enabled: false });
    expect(result.current).toBe(0);
    expect(capturedTailPush).toBeNull();
  });

  it('decays a half to 0 after EMPTY_TICKS_BEFORE_ZERO consecutive empty pushes, instead of holding it forever', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(result.current).toBe(150); // read=100, write=50

    for (let i = 0; i < 4; i++) {
      act(() => { capturedTailPush?.(tailFrame({})); });
    }
    expect(result.current).toBe(150); // still under the decay threshold

    act(() => { capturedTailPush?.(tailFrame({})); }); // 5th consecutive empty tick
    expect(result.current).toBe(0);
  });

  it('resumes updating a half immediately once a fresh point arrives after it decayed to 0', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();

    for (let i = 0; i < 5; i++) {
      act(() => { capturedTailPush?.(tailFrame({})); });
    }
    expect(result.current).toBe(0);

    act(() => { capturedTailPush?.(tailFrame({ 'disk-read': 200, 'disk-write': 10 })); });
    expect(result.current).toBe(210);
  });

  it('a bootstrap fetch resets a half to 0 rather than carrying forward when its window has no point for it', async () => {
    const { result, rerender } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(result.current).toBe(150); // read=100, write=50

    fetchMock.mockResolvedValueOnce({
      mocked: false, unsupported: false,
      data: {
        supported: true, retentionDays: 7, stepSeconds: 1,
        series: [{ id: 'disk-read', kind: 'disk', name: 'Disk Read', points: [{ t: 1, avg: 300, max: 300 }] }],
      },
    });
    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await flush();

    expect(result.current).toBe(300); // write reset to 0, not carried forward as 50
  });

  it('skips the reconnect-triggered refetch while the bootstrap fetch is still in flight', async () => {
    let resolveBootstrap!: (v: MetricHistoryFetchResult) => void;
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveBootstrap = res; }));

    const { rerender } = renderHook(() => useDiskIoRate(true));
    // The mount's own bootstrap is in flight.
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveBootstrap(resp(100, 50));
      await Promise.resolve();
    });
  });
});
