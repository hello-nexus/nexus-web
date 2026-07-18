import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiskIoRate } from './useDiskIoRate';
import type { MetricHistoryFetchResult, MetricHistoryQuery } from '../api/monitoringHistory';

const fetchMock = vi.fn<(query: MetricHistoryQuery) => Promise<MetricHistoryFetchResult>>();
vi.mock('../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: MetricHistoryQuery) => fetchMock(query),
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

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(resp(100, 50));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useDiskIoRate', () => {
  it('polls disk-read,disk-write on mount and reports the summed rate, independent of any active tab', async () => {
    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'disk-read,disk-write' }));
    expect(result.current).toBe(150);
  });

  it('keeps polling at a 1Hz cadence while enabled', async () => {
    renderHook(() => useDiskIoRate(true));
    await flush();
    fetchMock.mockClear();
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports 0 and does not poll while disabled', async () => {
    const { result } = renderHook(() => useDiskIoRate(false));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });

  it('drops a stale response superseded by a newer poll', async () => {
    let resolveFirst!: (v: MetricHistoryFetchResult) => void;
    fetchMock.mockImplementationOnce(() => new Promise(res => { resolveFirst = res; }));

    const { result } = renderHook(() => useDiskIoRate(true));
    await flush();
    expect(result.current).toBe(0);

    fetchMock.mockResolvedValueOnce(resp(200, 200));
    await advance(1000);
    expect(result.current).toBe(400);

    // The FIRST (now-stale) request resolves late - it must not regress the
    // already-newer value.
    resolveFirst(resp(10, 10));
    await flush();
    expect(result.current).toBe(400);
  });
});
