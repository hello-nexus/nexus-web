// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MonitoringHistoryCache, sliceToWindow } from './monitoringHistoryCache';
import type { MetricHistoryResponse } from '../api/monitoringHistory';

function resp(points: Array<{ t: number; avg: number; max: number }>): MetricHistoryResponse {
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [{ id: 'cpu', kind: 'cpu', name: 'CPU', points }] };
}

describe('MonitoringHistoryCache', () => {
  it('returns null for an exact-key miss', () => {
    const cache = new MonitoringHistoryCache();
    expect(cache.get(0, 100, 800, 'cpu')).toBeNull();
  });

  it('serves an exact-key hit', () => {
    const cache = new MonitoringHistoryCache();
    const data = resp([{ t: 0, avg: 1, max: 1 }]);
    cache.set(0, 100, 800, 'cpu', data);
    expect(cache.get(0, 100, 800, 'cpu')?.data).toBe(data);
  });

  it('does not match a different series or maxPoints at the same window', () => {
    const cache = new MonitoringHistoryCache();
    cache.set(0, 100, 800, 'cpu', resp([]));
    expect(cache.get(0, 100, 800, 'gpu')).toBeNull();
    expect(cache.get(0, 100, 400, 'cpu')).toBeNull();
  });

  it('findOverlapping finds a stored window that overlaps the query window', () => {
    const cache = new MonitoringHistoryCache();
    const data = resp([{ t: 50, avg: 1, max: 1 }]);
    cache.set(0, 100, 800, 'cpu', data);
    expect(cache.findOverlapping(50, 150, 'cpu')?.data).toBe(data);
  });

  it('findOverlapping returns null when nothing overlaps', () => {
    const cache = new MonitoringHistoryCache();
    cache.set(0, 100, 800, 'cpu', resp([]));
    expect(cache.findOverlapping(200, 300, 'cpu')).toBeNull();
  });

  it('findOverlapping ignores a different series', () => {
    const cache = new MonitoringHistoryCache();
    cache.set(0, 100, 800, 'gpu', resp([]));
    expect(cache.findOverlapping(0, 100, 'cpu')).toBeNull();
  });

  it('findOverlapping prefers the most recently stored candidate', () => {
    const cache = new MonitoringHistoryCache();
    const older = resp([{ t: 10, avg: 1, max: 1 }]);
    const newer = resp([{ t: 10, avg: 2, max: 2 }]);
    cache.set(0, 100, 800, 'cpu', older);
    cache.set(0, 200, 400, 'cpu', newer);
    expect(cache.findOverlapping(0, 50, 'cpu')?.data).toBe(newer);
  });

  it('evicts the oldest entry once the cache exceeds its bound', () => {
    const cache = new MonitoringHistoryCache();
    for (let i = 0; i < 30; i++) cache.set(i, i + 1, 800, 'cpu', resp([]));
    expect(cache.get(0, 1, 800, 'cpu')).toBeNull();
    expect(cache.get(29, 30, 800, 'cpu')).not.toBeNull();
  });
});

describe('sliceToWindow', () => {
  it('filters every series down to points within [from, to]', () => {
    const data: MetricHistoryResponse = {
      supported: true,
      retentionDays: 7,
      stepSeconds: 1,
      series: [
        { id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: 0, avg: 1, max: 1 }, { t: 50, avg: 2, max: 2 }, { t: 100, avg: 3, max: 3 }] },
      ],
    };
    const sliced = sliceToWindow(data, 25, 75);
    expect(sliced.series[0].points).toEqual([{ t: 50, avg: 2, max: 2 }]);
  });

  it('keeps points at the exact boundary (inclusive)', () => {
    const data: MetricHistoryResponse = {
      supported: true,
      retentionDays: 7,
      stepSeconds: 1,
      series: [{ id: 'cpu', kind: 'cpu', name: 'CPU', points: [{ t: 0, avg: 1, max: 1 }, { t: 100, avg: 2, max: 2 }] }],
    };
    const sliced = sliceToWindow(data, 0, 100);
    expect(sliced.series[0].points).toHaveLength(2);
  });
});
