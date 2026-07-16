import { describe, expect, it } from 'vitest';
import {
  CPU_TEMP_THRESHOLD_C,
  GPU_TEMP_THRESHOLD_C,
  RANGE_OPTIONS,
  initViewport,
  nearestTempAt,
  pickGpuHistorySeries,
  rangeKeyForWindow,
  sumSilhouette,
  tempBands,
  toHistoryChartSeries,
  viewportReducer,
  windowMsForRangeKey,
  xTickFormatForWindow,
  type ViewportState,
} from './metricHistoryHelpers';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function series(id: string, points: MetricHistorySeries['points'], over: Partial<MetricHistorySeries> = {}): MetricHistorySeries {
  return { id, kind: 'cpu', name: id, points, ...over };
}

describe('RANGE_OPTIONS', () => {
  it('covers the six presets in ascending window order', () => {
    expect(RANGE_OPTIONS.map(o => o.key)).toEqual(['1h', '3h', '12h', '24h', '3d', '7d']);
    for (let i = 1; i < RANGE_OPTIONS.length; i++) {
      expect(RANGE_OPTIONS[i].windowMs).toBeGreaterThan(RANGE_OPTIONS[i - 1].windowMs);
    }
  });
});

describe('windowMsForRangeKey / rangeKeyForWindow', () => {
  it('round-trips every preset', () => {
    for (const opt of RANGE_OPTIONS) {
      expect(windowMsForRangeKey(opt.key)).toBe(opt.windowMs);
      expect(rangeKeyForWindow(opt.windowMs)).toBe(opt.key);
    }
  });

  it('returns null for custom', () => {
    expect(windowMsForRangeKey('custom')).toBeNull();
  });

  it('matches within a small tolerance (drag pixel rounding)', () => {
    expect(rangeKeyForWindow(HOUR + 500)).toBe('1h');
  });

  it('falls back to custom for a window matching no preset', () => {
    expect(rangeKeyForWindow(90 * 60_000)).toBe('custom');
  });
});

describe('initViewport', () => {
  it('follows at a 1h window ending at now', () => {
    const now = 10_000_000;
    expect(initViewport(now)).toEqual({ from: now - HOUR, to: now, rangeKey: '1h', following: true });
  });
});

describe('viewportReducer', () => {
  const now = 10_000_000;
  const base: ViewportState = { from: now - HOUR, to: now, rangeKey: '1h', following: true };

  it('init produces the default 1h following viewport', () => {
    expect(viewportReducer(base, { type: 'init', now })).toEqual(initViewport(now));
  });

  it('setRange is right-edge anchored and reattaches following', () => {
    const detached: ViewportState = { from: now - 5 * HOUR, to: now - HOUR, rangeKey: 'custom', following: false };
    const next = viewportReducer(detached, { type: 'setRange', key: '3h', now });
    expect(next).toEqual({ from: now - 3 * HOUR, to: now, rangeKey: '3h', following: true });
  });

  it('brushChange detaches following when the new edge is short of now', () => {
    const next = viewportReducer(base, { type: 'brushChange', from: now - 5 * HOUR, to: now - 2 * HOUR, now });
    expect(next.following).toBe(false);
    expect(next.to).toBe(now - 2 * HOUR);
    expect(next.rangeKey).toBe('3h');
  });

  it('brushChange reattaches following when the edge touches (or passes) now', () => {
    const detached: ViewportState = { from: now - 5 * HOUR, to: now - HOUR, rangeKey: 'custom', following: false };
    const next = viewportReducer(detached, { type: 'brushChange', from: now - 3 * HOUR, to: now, now });
    expect(next.following).toBe(true);
    expect(next.to).toBe(now);
  });

  it('brushChange with a non-preset width reports custom', () => {
    const next = viewportReducer(base, { type: 'brushChange', from: now - 90 * 60_000, to: now, now });
    expect(next.rangeKey).toBe('custom');
    expect(next.following).toBe(true);
  });

  it('tick slides the window forward only while following, keeping width', () => {
    const later = now + 30_000;
    const next = viewportReducer(base, { type: 'tick', now: later });
    expect(next).toEqual({ from: later - HOUR, to: later, rangeKey: '1h', following: true });
  });

  it('tick is a no-op while detached', () => {
    const detached: ViewportState = { from: now - 5 * HOUR, to: now - HOUR, rangeKey: 'custom', following: false };
    expect(viewportReducer(detached, { type: 'tick', now: now + 60_000 })).toBe(detached);
  });

  it('retentionClamp pulls `from` forward when it exceeds the retention window, and is a no-op otherwise', () => {
    const wide: ViewportState = { from: now - 10 * DAY, to: now, rangeKey: 'custom', following: false };
    const clamped = viewportReducer(wide, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.from).toBe(now - 7 * DAY);

    const withinRetention: ViewportState = { from: now - 3 * DAY, to: now, rangeKey: '3d', following: false };
    expect(viewportReducer(withinRetention, { type: 'retentionClamp', retentionMs: 7 * DAY, now })).toBe(withinRetention);
  });
});

describe('xTickFormatForWindow', () => {
  it('uses time-of-day format for a window at or under a day', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(HOUR)(t)).toMatch(/\d{1,2}:\d{2}/);
  });

  it('uses weekday+hour format for a window under a week', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(3 * DAY)(t)).not.toMatch(/^\d{1,2}:\d{2}/);
  });

  it('uses month+day format for a window at or over a week', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(7 * DAY)(t)).toContain('Jul');
  });
});

describe('toHistoryChartSeries', () => {
  it('maps id/name/points and assigns color via the callback', () => {
    const raw = [series('cpu', [{ t: 0, avg: 10, max: 12 }])];
    const out = toHistoryChartSeries(raw, id => `#${id}`);
    expect(out).toEqual([{ id: 'cpu', name: 'cpu', color: '#cpu', points: [{ t: 0, avg: 10, max: 12 }] }]);
  });
});

describe('tempBands', () => {
  it('returns no bands when nothing is over threshold', () => {
    const points = [{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 42, max: 43 }];
    expect(tempBands(points, CPU_TEMP_THRESHOLD_C)).toEqual([]);
  });

  it('bands a single run of consecutive over-threshold points, extending the end by the point spacing', () => {
    const points = [
      { t: 0, avg: 40, max: 41 },
      { t: 1000, avg: 90, max: 91 },
      { t: 2000, avg: 92, max: 93 },
      { t: 3000, avg: 40, max: 41 },
    ];
    expect(tempBands(points, CPU_TEMP_THRESHOLD_C)).toEqual([{ startT: 1000, endT: 3000 }]);
  });

  it('bands a run that extends to the last point', () => {
    const points = [
      { t: 0, avg: 40, max: 41 },
      { t: 1000, avg: 95, max: 96 },
    ];
    expect(tempBands(points, GPU_TEMP_THRESHOLD_C)).toEqual([{ startT: 1000, endT: 2000 }]);
  });

  it('produces separate bands for two non-adjacent runs', () => {
    const points = [
      { t: 0, avg: 90, max: 91 },
      { t: 1000, avg: 40, max: 41 },
      { t: 2000, avg: 40, max: 41 },
      { t: 3000, avg: 91, max: 92 },
    ];
    expect(tempBands(points, CPU_TEMP_THRESHOLD_C)).toEqual([{ startT: 0, endT: 1000 }, { startT: 3000, endT: 4000 }]);
  });

  it('returns no bands for an empty series', () => {
    expect(tempBands([], CPU_TEMP_THRESHOLD_C)).toEqual([]);
  });
});

describe('nearestTempAt', () => {
  const points = [{ t: 0, avg: 40, max: 41 }, { t: 1000, avg: 50, max: 51 }];

  it('finds the nearest point within range', () => {
    expect(nearestTempAt(points, 900, 500)?.avg).toBe(50);
  });

  it('returns null when nothing is within range', () => {
    expect(nearestTempAt(points, 900, 50)).toBeNull();
  });
});

describe('sumSilhouette', () => {
  it('sums matching timestamps across series', () => {
    const inSeries = series('net-in', [{ t: 0, avg: 100, max: 120 }, { t: 1000, avg: 200, max: 220 }]);
    const outSeries = series('net-out', [{ t: 0, avg: 10, max: 12 }, { t: 1000, avg: 20, max: 22 }]);
    expect(sumSilhouette([inSeries, outSeries])).toEqual([
      { t: 0, avg: 110, max: 132 },
      { t: 1000, avg: 220, max: 242 },
    ]);
  });

  it('keeps a timestamp present in only one series', () => {
    const a = series('a', [{ t: 0, avg: 1, max: 1 }]);
    const b = series('b', [{ t: 1000, avg: 2, max: 2 }]);
    expect(sumSilhouette([a, b])).toEqual([{ t: 0, avg: 1, max: 1 }, { t: 1000, avg: 2, max: 2 }]);
  });

  it('returns an empty array for no series', () => {
    expect(sumSilhouette([])).toEqual([]);
  });
});

describe('pickGpuHistorySeries', () => {
  const gpu0 = series('gpu:0', [{ t: 0, avg: 10, max: 12 }], { kind: 'gpu', name: 'RTX 3070', adapterLuid: 'a' });
  const gpu1 = series('gpu:1', [{ t: 0, avg: 20, max: 22 }], { kind: 'gpu', name: 'RTX 4090', adapterLuid: 'b' });
  const temp0 = series('gpu-temp:0', [{ t: 0, avg: 50, max: 52 }], { kind: 'gpu-temp', name: 'RTX 3070', adapterLuid: 'a' });
  const temp1 = series('gpu-temp:1', [{ t: 0, avg: 60, max: 62 }], { kind: 'gpu-temp', name: 'RTX 4090', adapterLuid: 'b' });

  it('matches by adapterLuid first', () => {
    const result = pickGpuHistorySeries([gpu0, gpu1, temp0, temp1], 'b', 'RTX 3070');
    expect(result.load?.id).toBe('gpu:1');
    expect(result.temp?.id).toBe('gpu-temp:1');
  });

  it('falls back to a name match when adapterLuid is absent or unmatched', () => {
    const result = pickGpuHistorySeries([gpu0, gpu1, temp0, temp1], '', 'RTX 4090');
    expect(result.load?.id).toBe('gpu:1');
    expect(result.temp?.id).toBe('gpu-temp:1');
  });

  it('falls back to the lone gpu series when neither luid nor name match', () => {
    const result = pickGpuHistorySeries([gpu0, temp0], 'unmatched', 'Unmatched GPU');
    expect(result.load?.id).toBe('gpu:0');
    expect(result.temp?.id).toBe('gpu-temp:0');
  });

  it('returns nulls when nothing resolves among multiple candidates', () => {
    const result = pickGpuHistorySeries([gpu0, gpu1, temp0, temp1], 'unmatched', 'Unmatched GPU');
    expect(result).toEqual({ load: null, temp: null });
  });

  it('returns nulls for an empty series list', () => {
    expect(pickGpuHistorySeries([], 'a', 'RTX 3070')).toEqual({ load: null, temp: null });
  });
});
