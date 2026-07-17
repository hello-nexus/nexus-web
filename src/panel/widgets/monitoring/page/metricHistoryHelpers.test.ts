import { describe, expect, it } from 'vitest';
import {
  CPU_TEMP_THRESHOLD_C,
  GPU_TEMP_THRESHOLD_C,
  RANGE_OPTIONS,
  defaultBoxWidthMs,
  formatBrushEdgeLabels,
  initViewport,
  nearestTempAt,
  pickGpuHistorySeries,
  rangeKeyForWindow,
  rangeLabelKey,
  seriesQueryFor,
  sumSilhouette,
  tempBands,
  toHistoryChartSeries,
  viewportReducer,
  windowMsForRangeKey,
  xTickFormatForWindow,
  type ViewportState,
} from './metricHistoryHelpers';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';
import { MIN_BOX_WINDOW_MS } from '../../../../components/common/TimelineBrush/timelineBrushUtils';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function series(id: string, points: MetricHistorySeries['points'], over: Partial<MetricHistorySeries> = {}): MetricHistorySeries {
  return { id, kind: 'cpu', name: id, points, ...over };
}

describe('RANGE_OPTIONS', () => {
  it('covers the eight presets in ascending window order', () => {
    expect(RANGE_OPTIONS.map(o => o.key)).toEqual(['5m', '30m', '1h', '3h', '12h', '24h', '3d', '7d']);
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

  it('matches within a small tolerance (retention-clamp rounding)', () => {
    expect(rangeKeyForWindow(HOUR + 500)).toBe('1h');
  });

  it('falls back to custom for a window matching no preset', () => {
    expect(rangeKeyForWindow(90 * MINUTE)).toBe('custom');
  });
});

describe('rangeLabelKey', () => {
  it('resolves a preset key to its i18n label key', () => {
    expect(rangeLabelKey('5m')).toBe('monitoring.history.range.5m');
    expect(rangeLabelKey('7d')).toBe('monitoring.history.range.7d');
  });
});

describe('defaultBoxWidthMs', () => {
  it('is a third of the strip for a wide-enough strip', () => {
    expect(defaultBoxWidthMs(3 * HOUR)).toBe(HOUR);
  });

  it('floors at MIN_BOX_WINDOW_MS, capped at the strip width itself', () => {
    // The 5m preset: a third would be under the 5-minute floor, so the box
    // fills the whole strip - matches the reference recording at this preset.
    expect(defaultBoxWidthMs(5 * MINUTE)).toBe(5 * MINUTE);
  });
});

describe('seriesQueryFor', () => {
  it('maps each metric to its series csv', () => {
    expect(seriesQueryFor('cpu')).toBe('cpu,cpu-temp');
    expect(seriesQueryFor('memory')).toBe('memory');
    expect(seriesQueryFor('network')).toBe('net-in,net-out');
    expect(seriesQueryFor('gpu')).toBe('gpu,gpu-temp');
  });
});

describe('initViewport', () => {
  it('follows at the 5m default: a 5m strip whose box fills it', () => {
    const now = 10_000_000;
    expect(initViewport(now)).toEqual({
      from: now - 5 * MINUTE, to: now,
      stripFrom: now - 5 * MINUTE, stripTo: now,
      rangeKey: '5m', lastPresetKey: '5m', following: true,
    });
  });
});

describe('viewportReducer', () => {
  const now = 10_000_000;
  const base: ViewportState = {
    from: now - HOUR, to: now,
    stripFrom: now - 3 * HOUR, stripTo: now,
    rangeKey: '3h', lastPresetKey: '3h', following: true,
  };

  it('init produces the default 5m following viewport', () => {
    expect(viewportReducer(base, { type: 'init', now })).toEqual(initViewport(now));
  });

  it('setRange sizes the strip to the preset and the box to a third of it, right-edge anchored', () => {
    const detached: ViewportState = {
      from: now - 5 * HOUR, to: now - HOUR,
      stripFrom: now - 12 * HOUR, stripTo: now - HOUR,
      rangeKey: 'custom', lastPresetKey: '12h', following: false,
    };
    const next = viewportReducer(detached, { type: 'setRange', key: '3h', now });
    expect(next).toEqual({
      from: now - HOUR, to: now,
      stripFrom: now - 3 * HOUR, stripTo: now,
      rangeKey: '3h', lastPresetKey: '3h', following: true,
    });
  });

  it('brushChange moves only the box within the strip, leaving rangeKey and the strip untouched', () => {
    const next = viewportReducer(base, { type: 'brushChange', from: now - 3 * HOUR, to: now - 2 * HOUR, now });
    expect(next.from).toBe(now - 3 * HOUR);
    expect(next.to).toBe(now - 2 * HOUR);
    expect(next.stripFrom).toBe(base.stripFrom);
    expect(next.stripTo).toBe(base.stripTo);
    expect(next.rangeKey).toBe('3h');
    expect(next.following).toBe(false);
  });

  it('brushChange reattaches following when the box edge touches (or passes) now', () => {
    const detached: ViewportState = { ...base, from: now - 3 * HOUR, to: now - HOUR, following: false };
    const next = viewportReducer(detached, { type: 'brushChange', from: now - 2 * HOUR, to: now, now });
    expect(next.following).toBe(true);
    expect(next.to).toBe(now);
    expect(next.rangeKey).toBe('3h');
  });

  it('chartDragSelect sets the box to the exact selection, goes custom, and re-derives a 3x centered strip', () => {
    const selFrom = now - 90 * MINUTE;
    const selTo = now - 60 * MINUTE;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom, to: selTo, now, retentionMs: 7 * DAY });
    expect(next.from).toBe(selFrom);
    expect(next.to).toBe(selTo);
    expect(next.rangeKey).toBe('custom');
    expect(next.lastPresetKey).toBe('3h');
    expect(next.following).toBe(false);
    // Strip is 3x the 30-minute selection (90 minutes), centered on it.
    expect(next.stripTo - next.stripFrom).toBe(90 * MINUTE);
    expect(next.stripFrom).toBeLessThanOrEqual(selFrom);
    expect(next.stripTo).toBeGreaterThanOrEqual(selTo);
  });

  it('chartDragSelect clamps the re-derived strip to the live edge and retention floor', () => {
    // Selecting near "now" would otherwise want a strip extending past now.
    const selFrom = now - 10 * MINUTE;
    const selTo = now - MINUTE;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom, to: selTo, now, retentionMs: 7 * DAY });
    expect(next.stripTo).toBeLessThanOrEqual(now);
  });

  it('chartDragSelect floors a near-zero-width selection at MIN_BOX_WINDOW_MS, matching a TimelineBrush drag\'s own floor', () => {
    const selFrom = now - 5 * HOUR;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom, to: selFrom + 3_000, now, retentionMs: 7 * DAY });
    expect(next.to - next.from).toBe(MIN_BOX_WINDOW_MS);
    expect(next.from).toBe(selFrom);
  });

  it('chartDragSelect pulls a floored selection back under the live edge rather than overshooting it', () => {
    const selFrom = now - 3_000;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom, to: now, now, retentionMs: 7 * DAY });
    expect(next.to).toBe(now);
    expect(next.to - next.from).toBe(MIN_BOX_WINDOW_MS);
  });

  it('chartDragSelect sorts a reversed [to, from] selection before applying the floor', () => {
    const selFrom = now - 5 * HOUR;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom + 3_000, to: selFrom, now, retentionMs: 7 * DAY });
    expect(next.from).toBe(selFrom);
    expect(next.to - next.from).toBe(MIN_BOX_WINDOW_MS);
  });

  it('chartDragSelect reattaches following when the selection touches now', () => {
    const next = viewportReducer(base, { type: 'chartDragSelect', from: now - 10 * MINUTE, to: now, now, retentionMs: 7 * DAY });
    expect(next.following).toBe(true);
  });

  it('tick slides both the box and the strip forward only while following, keeping both widths', () => {
    const later = now + 30_000;
    const next = viewportReducer(base, { type: 'tick', now: later });
    expect(next).toEqual({
      from: later - HOUR, to: later,
      stripFrom: later - 3 * HOUR, stripTo: later,
      rangeKey: '3h', lastPresetKey: '3h', following: true,
    });
  });

  it('tick is a no-op while detached', () => {
    const detached: ViewportState = { ...base, following: false };
    expect(viewportReducer(detached, { type: 'tick', now: now + 60_000 })).toBe(detached);
  });

  it('retentionClamp pulls the strip (and box) forward when the strip exceeds retention, and is a no-op otherwise', () => {
    const wide: ViewportState = {
      from: now - 5 * DAY, to: now,
      stripFrom: now - 10 * DAY, stripTo: now,
      rangeKey: 'custom', lastPresetKey: '7d', following: false,
    };
    const clamped = viewportReducer(wide, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.stripFrom).toBe(now - 7 * DAY);
    expect(clamped.from).toBe(now - 5 * DAY);
    expect(clamped.rangeKey).toBe('7d');

    const withinRetention: ViewportState = { ...base, stripFrom: now - 3 * DAY, stripTo: now };
    expect(viewportReducer(withinRetention, { type: 'retentionClamp', retentionMs: 7 * DAY, now })).toBe(withinRetention);
  });

  it('retentionClamp also pulls a box that would otherwise fall outside the clamped strip', () => {
    const wide: ViewportState = {
      from: now - 8 * DAY, to: now - 7.5 * DAY,
      stripFrom: now - 10 * DAY, stripTo: now,
      rangeKey: 'custom', lastPresetKey: '7d', following: false,
    };
    const clamped = viewportReducer(wide, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.from).toBe(now - 7 * DAY);
  });

  it('backToLive re-anchors both box and strip to now, preserving their current widths and rangeKey', () => {
    const detached: ViewportState = {
      from: now - 20 * MINUTE - 5 * HOUR, to: now - 5 * HOUR,
      stripFrom: now - 60 * MINUTE - 5 * HOUR, stripTo: now - 5 * HOUR,
      rangeKey: 'custom', lastPresetKey: '1h', following: false,
    };
    const next = viewportReducer(detached, { type: 'backToLive', now });
    expect(next.to).toBe(now);
    expect(next.to - next.from).toBe(20 * MINUTE);
    expect(next.stripTo).toBe(now);
    expect(next.stripTo - next.stripFrom).toBe(60 * MINUTE);
    expect(next.following).toBe(true);
    expect(next.rangeKey).toBe('custom');
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

describe('formatBrushEdgeLabels', () => {
  it('shows time-only labels when both edges fall on the same day', () => {
    // Local-time constructors (not UTC ISO strings) so the same-day/
    // different-day boundary is independent of the test runner's timezone,
    // matching the getFullYear/getMonth/getDate (local) getters the
    // implementation itself uses.
    const start = new Date(2026, 6, 16, 11, 31, 4).getTime();
    const end = new Date(2026, 6, 16, 11, 36, 4).getTime();
    const [a, b] = formatBrushEdgeLabels(start, end, 'en-US');
    expect(a).not.toMatch(/Jul/);
    expect(b).not.toMatch(/Jul/);
  });

  it('includes the short localized day on both labels when the edges span different days', () => {
    const start = new Date(2026, 6, 15, 23, 58, 0).getTime();
    const end = new Date(2026, 6, 16, 0, 3, 0).getTime();
    const [a, b] = formatBrushEdgeLabels(start, end, 'en-US');
    expect(a).toMatch(/Jul/);
    expect(b).toMatch(/Jul/);
  });
});
