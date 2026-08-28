// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  RANGE_OPTIONS,
  adaptivePercentYMax,
  appsSeriesParamFor,
  averageRpmSeries,
  buildSelectedAppSeries,
  currentDiskRateBytesPerSec,
  defaultBoxWidthMs,
  deriveMemoryTotalMb,
  fanNamesForRole,
  fanSeriesIdsForRole,
  formatBrushEdgeLabels,
  initViewport,
  maxAvgValue,
  nearestTempAt,
  pickGpuHistorySeries,
  rangeKeyForWindow,
  resolveSelectedFrame,
  seriesQueryFor,
  sumRpmSeriesForRole,
  sumSilhouette,
  toHistoryChartSeries,
  viewportReducer,
  windowMsForRangeKey,
  xTickFormatForWindow,
  formatSelectedFrameTime,
  type FanRoleMap,
  type ViewportState,
} from './metricHistoryHelpers';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';
import type { AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import { MIN_BOX_WINDOW_MS } from '../../../../components/common/TimelineBrush/timelineBrushUtils';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function series(id: string, points: MetricHistorySeries['points'], over: Partial<MetricHistorySeries> = {}): MetricHistorySeries {
  return { id, kind: 'cpu', name: id, points, ...over };
}

describe('RANGE_OPTIONS', () => {
  it('covers the five presets in ascending window order', () => {
    expect(RANGE_OPTIONS.map(o => o.key)).toEqual(['30m', '3h', '24h', '3d', '7d']);
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
    expect(rangeKeyForWindow(3 * HOUR + 500)).toBe('3h');
  });

  it('falls back to custom for a window matching no preset', () => {
    expect(rangeKeyForWindow(90 * MINUTE)).toBe('custom');
  });

  it('falls back to custom for a window matching a still-removed preset (1h/12h - 5m/30m stayed/came back)', () => {
    expect(rangeKeyForWindow(HOUR)).toBe('custom');
    expect(rangeKeyForWindow(12 * HOUR)).toBe('custom');
  });
});

describe('defaultBoxWidthMs', () => {
  it('is a sixth of the strip for a wide-enough strip', () => {
    expect(defaultBoxWidthMs(3 * HOUR)).toBe(30 * MINUTE);
  });

  it('highlights the last 5 minutes of the 30m preset strip (item 42\'s canonical example)', () => {
    expect(defaultBoxWidthMs(30 * MINUTE)).toBe(5 * MINUTE);
  });

  it('floors at MIN_BOX_WINDOW_MS, capped at the strip width itself', () => {
    // A strip narrow enough that a sixth would be under the floor: the box
    // floors at MIN_BOX_WINDOW_MS itself.
    expect(defaultBoxWidthMs(3 * MINUTE)).toBe(MIN_BOX_WINDOW_MS);
    // A strip narrower than the floor itself: the box fills the whole strip.
    expect(defaultBoxWidthMs(30_000)).toBe(30_000);
  });
});

describe('seriesQueryFor', () => {
  it('maps each metric to its series csv', () => {
    // cpu/gpu request fan too (average fan-speed ribbon, under the temp
    // band) and fps (the FPS ribbon, gaps stay gaps when nothing presented);
    // memory requests its own averaged mem-temp series but no fan or fps -
    // network/storage have no temp band at all.
    expect(seriesQueryFor('cpu')).toBe('cpu,cpu-temp,fan,fps');
    expect(seriesQueryFor('memory')).toBe('memory,mem-temp');
    expect(seriesQueryFor('storage')).toBe('disk-read,disk-write');
    expect(seriesQueryFor('network')).toBe('net-in,net-out');
    expect(seriesQueryFor('gpu')).toBe('gpu,gpu-temp,fan,fps');
  });
});

describe('appsSeriesParamFor', () => {
  it('maps each metric to its apps-window series param', () => {
    expect(appsSeriesParamFor('cpu')).toBe('cpu');
    expect(appsSeriesParamFor('memory')).toBe('memory');
    expect(appsSeriesParamFor('network')).toBe('net');
  });

  it('requests the bare gpu kind, not an adapter-scoped gpu:<id> (item 51)', () => {
    expect(appsSeriesParamFor('gpu')).toBe('gpu');
  });

  it('requests the storage series - per-app disk I/O is now recorded service-side', () => {
    expect(appsSeriesParamFor('storage')).toBe('storage');
  });
});

describe('currentDiskRateBytesPerSec', () => {
  it('sums the newest disk-read and disk-write points', () => {
    const list = [
      series('disk-read', [{ t: 0, avg: 100, max: 100 }, { t: 1, avg: 300, max: 300 }], { kind: 'disk' }),
      series('disk-write', [{ t: 0, avg: 50, max: 50 }, { t: 1, avg: 120, max: 120 }], { kind: 'disk' }),
    ];
    expect(currentDiskRateBytesPerSec(list)).toBe(420);
  });

  it('treats a missing series as 0 (e.g. only one of the two has landed yet)', () => {
    const list = [series('disk-read', [{ t: 0, avg: 100, max: 100 }], { kind: 'disk' })];
    expect(currentDiskRateBytesPerSec(list)).toBe(100);
  });

  it('returns 0 for empty input', () => {
    expect(currentDiskRateBytesPerSec([])).toBe(0);
  });
});

describe('initViewport', () => {
  it('follows at the 30m default: a 30m strip whose box highlights the last 5 minutes (a sixth)', () => {
    const now = 10_000_000;
    expect(initViewport(now)).toEqual({
      from: now - 5 * MINUTE, to: now,
      stripFrom: now - 30 * MINUTE, stripTo: now,
      rangeKey: '30m', lastPresetKey: '30m', following: true,
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

  it('init produces the default 30m following viewport', () => {
    expect(viewportReducer(base, { type: 'init', now })).toEqual(initViewport(now));
  });

  it('setRange sizes the strip to the preset and the box to a sixth of it, right-edge anchored', () => {
    const detached: ViewportState = {
      from: now - 5 * HOUR, to: now - HOUR,
      stripFrom: now - 12 * HOUR, stripTo: now - HOUR,
      rangeKey: 'custom', lastPresetKey: '24h', following: false,
    };
    const next = viewportReducer(detached, { type: 'setRange', key: '3h', now });
    expect(next).toEqual({
      from: now - 30 * MINUTE, to: now,
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

  it('brushChange reattaches when dragged to the strip\'s own (frozen, stale) right edge, not just the live now', () => {
    // A detached strip only slides on a live tick, so it freezes at
    // whatever stripTo was at the moment of detach. Real time (`now`) keeps
    // advancing past it - TimelineBrush's own edge-snap makes a right-edge
    // drag land exactly on that frozen stripTo, not on the (by then later)
    // live edge, so `to >= now` alone would never reattach again.
    const staleStripTo = now - 5_000;
    const detached: ViewportState = {
      from: now - 3 * HOUR - 5_000, to: now - HOUR - 5_000,
      stripFrom: now - 6 * HOUR - 5_000, stripTo: staleStripTo,
      rangeKey: '3h', lastPresetKey: '3h', following: false,
    };
    const next = viewportReducer(detached, { type: 'brushChange', from: staleStripTo - HOUR, to: staleStripTo, now });
    expect(next.following).toBe(true);
    expect(next.to).toBe(now);
    expect(next.to - next.from).toBe(HOUR);
    expect(next.stripTo).toBe(now);
    expect(next.stripTo - next.stripFrom).toBe(6 * HOUR);
  });

  it('brushChange does not reattach for a box short of the strip edge', () => {
    const detached: ViewportState = { ...base, from: now - 3 * HOUR, to: now - HOUR, following: false };
    const next = viewportReducer(detached, { type: 'brushChange', from: now - 2 * HOUR, to: now - MINUTE, now });
    expect(next.following).toBe(false);
    expect(next.to).toBe(now - MINUTE);
  });

  it('chartDragSelect sets the box to the exact selection, goes custom, and re-derives a 6x centered strip', () => {
    const selFrom = now - 90 * MINUTE;
    const selTo = now - 60 * MINUTE;
    const next = viewportReducer(base, { type: 'chartDragSelect', from: selFrom, to: selTo, now, retentionMs: 7 * DAY });
    expect(next.from).toBe(selFrom);
    expect(next.to).toBe(selTo);
    expect(next.rangeKey).toBe('custom');
    expect(next.lastPresetKey).toBe('3h');
    expect(next.following).toBe(false);
    // Strip is 6x the 30-minute selection (3 hours), centered on it.
    expect(next.stripTo - next.stripFrom).toBe(3 * HOUR);
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

  it('retentionClamp shifts a box entirely below the floor up to it, preserving width instead of inverting the domain', () => {
    // Both from AND to sit below the retention floor here (floor = now -
    // 7d) - clamping `from` alone while leaving `to` at now - 7.5d would
    // produce from > to.
    const wide: ViewportState = {
      from: now - 8 * DAY, to: now - 7.5 * DAY,
      stripFrom: now - 10 * DAY, stripTo: now,
      rangeKey: 'custom', lastPresetKey: '7d', following: false,
    };
    const clamped = viewportReducer(wide, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.from).toBe(now - 7 * DAY);
    expect(clamped.to).toBe(now - 6.5 * DAY);
    expect(clamped.from).toBeLessThan(clamped.to);
    expect(clamped.to - clamped.from).toBe(wide.to - wide.from);
    expect(clamped.rangeKey).toBe('7d');
  });

  it('retentionClamp derives rangeKey from the clamped strip width, not the raw retention width', () => {
    // A detached strip frozen 1 day in the past (stripTo = now - 1d) clamped
    // against a 7d retention: the clamped strip only spans 6d (now-1d minus
    // the floor at now-7d), not the full 7d retention window - rangeKey
    // must reflect that narrower span (no matching preset -> 'custom'), not
    // rangeKeyForWindow(retentionMs) which would wrongly report '7d'.
    const detachedOld: ViewportState = {
      from: now - 8 * DAY - HOUR, to: now - 8 * DAY,
      stripFrom: now - 11 * DAY, stripTo: now - DAY,
      rangeKey: 'custom', lastPresetKey: '3h', following: false,
    };
    const clamped = viewportReducer(detachedOld, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.stripFrom).toBe(now - 7 * DAY);
    expect(clamped.rangeKey).toBe('custom');
  });

  it('retentionClamp keeps the box non-zero-width and the strip valid when the whole detached viewport - box AND strip - has already aged past the new floor', () => {
    // Both stripFrom AND stripTo sit below the retention floor (now - 7d)
    // here, unlike the two tests above where only the box was that old - the
    // ceiling this action derives from stripTo would equal floor exactly
    // without the MIN_BOX_WINDOW_MS margin, collapsing the box to zero width
    // and leaving stripTo untouched (and therefore behind the new stripFrom).
    const deepPast: ViewportState = {
      from: now - 8.5 * DAY, to: now - 8 * DAY,
      stripFrom: now - 11 * DAY, stripTo: now - 8 * DAY,
      rangeKey: 'custom', lastPresetKey: '7d', following: false,
    };
    const clamped = viewportReducer(deepPast, { type: 'retentionClamp', retentionMs: 7 * DAY, now });
    expect(clamped.from).toBe(now - 7 * DAY);
    expect(clamped.to).toBe(now - 7 * DAY + MIN_BOX_WINDOW_MS);
    expect(clamped.to).toBeGreaterThan(clamped.from);
    expect(clamped.to - clamped.from).toBeGreaterThanOrEqual(MIN_BOX_WINDOW_MS);
    expect(clamped.stripFrom).toBeLessThan(clamped.stripTo);
    expect(clamped.rangeKey).toBe('custom');
  });

  it('backToLive re-anchors both box and strip to now, preserving their current widths and rangeKey', () => {
    const detached: ViewportState = {
      from: now - 20 * MINUTE - 5 * HOUR, to: now - 5 * HOUR,
      stripFrom: now - 60 * MINUTE - 5 * HOUR, stripTo: now - 5 * HOUR,
      rangeKey: 'custom', lastPresetKey: '3h', following: false,
    };
    const next = viewportReducer(detached, { type: 'backToLive', now });
    expect(next.to).toBe(now);
    expect(next.to - next.from).toBe(20 * MINUTE);
    expect(next.stripTo).toBe(now);
    expect(next.stripTo - next.stripFrom).toBe(60 * MINUTE);
    expect(next.following).toBe(true);
    expect(next.rangeKey).toBe('custom');
  });

  it('detach stops following without touching the box or strip (a plain chart click, unlike chartDragSelect)', () => {
    const following: ViewportState = {
      from: now - 20 * MINUTE, to: now,
      stripFrom: now - 3 * HOUR, stripTo: now,
      rangeKey: '3h', lastPresetKey: '3h', following: true,
    };
    const next = viewportReducer(following, { type: 'detach' });
    expect(next.following).toBe(false);
    expect(next.from).toBe(following.from);
    expect(next.to).toBe(following.to);
    expect(next.stripFrom).toBe(following.stripFrom);
    expect(next.stripTo).toBe(following.stripTo);
    expect(next.rangeKey).toBe('3h');
  });

  it('detach is a no-op (same reference) when already not following', () => {
    const detached: ViewportState = {
      from: now - 20 * MINUTE - 5 * HOUR, to: now - 5 * HOUR,
      stripFrom: now - 3 * HOUR - 5 * HOUR, stripTo: now - 5 * HOUR,
      rangeKey: 'custom', lastPresetKey: '3h', following: false,
    };
    expect(viewportReducer(detached, { type: 'detach' })).toBe(detached);
  });
});

describe('xTickFormatForWindow', () => {
  it('uses time-of-day format for a window at or under a day', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(HOUR, 'system')(t)).toMatch(/\d{1,2}:\d{2}/);
  });

  it('uses weekday+hour format for a window under a week', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(3 * DAY, 'system')(t)).not.toMatch(/^\d{1,2}:\d{2}/);
  });

  it('uses month+day format for a window at or over a week', () => {
    const t = new Date('2026-07-08T14:32:00Z').getTime();
    expect(xTickFormatForWindow(7 * DAY, 'system')(t)).toContain('Jul');
  });
});

// The monitoring surfaces render through these helpers, so the Units > Time
// format setting has to reach every one of them.
describe('Time format setting', () => {
  const T = new Date('2026-07-08T14:32:10Z').getTime();

  it('drops AM/PM from the axis ticks under 24h', () => {
    expect(xTickFormatForWindow(HOUR, '24h')(T)).not.toMatch(/[AP]M/i);
    expect(xTickFormatForWindow(HOUR, '12h')(T)).toMatch(/[AP]M/i);
  });

  it('drops AM/PM from the selected-frame chip under 24h', () => {
    expect(formatSelectedFrameTime(T, HOUR, '24h')).not.toMatch(/[AP]M/i);
    expect(formatSelectedFrameTime(T, HOUR, '12h')).toMatch(/[AP]M/i);
  });

  it('drops AM/PM from the seek-bar edge labels under 24h', () => {
    const [a] = formatBrushEdgeLabels(T, T + HOUR, '24h', 'en-US');
    expect(a.time).not.toMatch(/[AP]M/i);
    const [b] = formatBrushEdgeLabels(T, T + HOUR, '12h', 'en-US');
    expect(b.time).toMatch(/[AP]M/i);
  });
});

describe('formatSelectedFrameTime', () => {
  const T = new Date('2026-07-08T14:32:23Z').getTime();

  it('always carries seconds for a window within a day', () => {
    expect(formatSelectedFrameTime(T, HOUR, 'system')).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('stays time-only (no date) at exactly one day, matching the axis time-only branch', () => {
    expect(formatSelectedFrameTime(T, DAY, 'system')).not.toContain('Jul');
    expect(formatSelectedFrameTime(T, DAY, 'system')).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('prepends the date and keeps seconds for a window wider than a day', () => {
    const label = formatSelectedFrameTime(T, 3 * DAY, 'system');
    expect(label).toContain('Jul');
    expect(label).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe('maxAvgValue', () => {
  it('returns the largest avg across every series and point', () => {
    const s = [
      series('a', [{ t: 0, avg: 10, max: 15 }, { t: 1000, avg: 30, max: 99 }]),
      series('b', [{ t: 0, avg: 5, max: 5 }]),
    ];
    expect(maxAvgValue(s)).toBe(30);
  });

  it('ignores max/only looks at avg (matches what the chart line actually draws)', () => {
    const s = [series('a', [{ t: 0, avg: 1, max: 500 }])];
    expect(maxAvgValue(s)).toBe(1);
  });

  it('returns 0 for no series or all-empty series', () => {
    expect(maxAvgValue([])).toBe(0);
    expect(maxAvgValue([series('a', [])])).toBe(0);
  });
});

describe('adaptivePercentYMax (item R5-2: adaptive y axis)', () => {
  it('never scales below the ladder floor (10) for an idle/flat window', () => {
    expect(adaptivePercentYMax(0)).toBe(10);
    expect(adaptivePercentYMax(3)).toBe(10);
  });

  it('snaps up to a round step comfortably above a moderate peak, never clipping it', () => {
    const yMax = adaptivePercentYMax(18);
    expect(yMax).toBeGreaterThan(18);
    expect([10, 20, 25, 50, 100]).toContain(yMax);
  });

  it('never exceeds 100 (a percent metric can\'t peak above it)', () => {
    expect(adaptivePercentYMax(90)).toBe(100);
    expect(adaptivePercentYMax(100)).toBe(100);
  });

  it('the result never sits below the raw peak (100 is the one boundary where there is no more headroom to give)', () => {
    for (const peak of [0, 1, 9, 10, 11, 19, 20, 21, 24, 25, 26, 49, 50, 51, 80, 99]) {
      expect(adaptivePercentYMax(peak)).toBeGreaterThan(peak);
    }
    expect(adaptivePercentYMax(100)).toBeGreaterThanOrEqual(100);
  });

  it('only moves between the fixed ladder marks - never an arbitrary value', () => {
    for (const peak of [0, 5, 12, 18, 22, 30, 44, 60, 85]) {
      expect([10, 20, 25, 50, 100]).toContain(adaptivePercentYMax(peak));
    }
  });
});

describe('toHistoryChartSeries', () => {
  it('maps id/name/points and assigns color via the callback', () => {
    const raw = [series('cpu', [{ t: 0, avg: 10, max: 12 }])];
    const out = toHistoryChartSeries(raw, id => `#${id}`);
    expect(out).toEqual([{ id: 'cpu', name: 'cpu', color: '#cpu', points: [{ t: 0, avg: 10, max: 12 }] }]);
  });
});

describe('deriveMemoryTotalMb', () => {
  it('backs out the total from used GB and used percent', () => {
    // 8GB used at 25% -> 32GB total -> 32768 MB.
    expect(deriveMemoryTotalMb(8, 25)).toBeCloseTo(32768, 5);
  });

  it('returns null when usedGb is undefined (no sensor reported it)', () => {
    expect(deriveMemoryTotalMb(undefined, 25)).toBeNull();
  });

  it('returns null when the percent is zero or negative (division would be meaningless)', () => {
    expect(deriveMemoryTotalMb(8, 0)).toBeNull();
    expect(deriveMemoryTotalMb(8, -5)).toBeNull();
  });
});

describe('buildSelectedAppSeries', () => {
  function app(over: Partial<AppWindowSeries> = {}): AppWindowSeries {
    return { name: 'chrome.exe', avg: 10, max: 20, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 20 }], ...over };
  }

  it('passes cpu/gpu percent values through unscaled', () => {
    const out = buildSelectedAppSeries(app(), 'cpu', null, 'var(--chart-line-alt)');
    expect(out).toEqual({
      id: 'app:chrome.exe',
      name: 'chrome.exe',
      color: 'var(--chart-line-alt)',
      points: [{ t: 0, avg: 10, max: 10 }, { t: 1000, avg: 20, max: 20 }],
      noFill: true,
      noDots: true,
    });
  });

  it('always carries noFill: true and noDots: true, since it overlays the base metric line rather than replacing it (item 49) and must never draw isolated markers (item 58)', () => {
    const out = buildSelectedAppSeries(app(), 'cpu', null, 'var(--text)');
    expect(out?.noFill).toBe(true);
    expect(out?.noDots).toBe(true);
  });

  it('passes network/storage byte-rate values through unscaled - the axis auto-scales to whatever is plotted', () => {
    const out = buildSelectedAppSeries(app({ points: [{ t: 0, avg: 4_400_000 }] }), 'storage', null, 'var(--chart-line-alt)');
    expect(out?.points).toEqual([{ t: 0, avg: 4_400_000, max: 4_400_000 }]);
  });

  it('rescales memory MB values to percent-of-RAM using memoryTotalMb', () => {
    const out = buildSelectedAppSeries(app({ points: [{ t: 0, avg: 8192 }] }), 'memory', 32768, 'var(--chart-line-alt)');
    expect(out?.points).toEqual([{ t: 0, avg: 25, max: 25 }]);
  });

  it('returns null for memory when memoryTotalMb is unavailable - an unscaled MB value would misrender on a percent axis', () => {
    expect(buildSelectedAppSeries(app(), 'memory', null, 'var(--chart-line-alt)')).toBeNull();
  });

  it('ids the series distinctly from any real metric id (app: prefix)', () => {
    const out = buildSelectedAppSeries(app({ name: 'gpu' }), 'cpu', null, 'var(--chart-line-alt)');
    expect(out?.id).toBe('app:gpu');
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

describe('averageRpmSeries', () => {
  function fan(id: string, points: MetricHistorySeries['points']): MetricHistorySeries {
    return series(id, points, { kind: 'fan' });
  }

  it('averages two fans at a shared timestamp, taking the max of their max', () => {
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }]);
    const fan2 = fan('fan:2', [{ t: 0, avg: 1600, max: 1500 }]);
    expect(averageRpmSeries([fan1, fan2])).toEqual([{ t: 0, avg: 1400, max: 1500 }]);
  });

  it('averages only the fans present at a timestamp - one fan is missing, not treated as 0 (gap-aware)', () => {
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }, { t: 1000, avg: 1240, max: 1280 }]);
    const fan2 = fan('fan:2', [{ t: 0, avg: 1600, max: 1500 }]);
    expect(averageRpmSeries([fan1, fan2])).toEqual([
      { t: 0, avg: 1400, max: 1500 },
      { t: 1000, avg: 1240, max: 1280 },
    ]);
  });

  it('ignores non-fan series', () => {
    const cpu = series('cpu', [{ t: 0, avg: 99, max: 99 }]);
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }]);
    expect(averageRpmSeries([cpu, fan1])).toEqual([{ t: 0, avg: 1200, max: 1250 }]);
  });

  it('returns an empty array for no series, or series with no fan kind', () => {
    expect(averageRpmSeries([])).toEqual([]);
    expect(averageRpmSeries([series('cpu', [{ t: 0, avg: 1, max: 1 }])])).toEqual([]);
  });
});

describe('fanSeriesIdsForRole / fanNamesForRole', () => {
  function roleMap(entries: Array<[string, { role: 'none' | 'cpu' | 'gpu'; name: string }]>): FanRoleMap {
    return new Map(entries);
  }

  it('collects only the ids/names marked with the given role', () => {
    const map = roleMap([
      ['fan:1', { role: 'cpu', name: 'Front Fan' }],
      ['fan:2', { role: 'gpu', name: 'Top Fan' }],
      ['fan:3', { role: 'cpu', name: 'Rear Fan' }],
      ['fan:4', { role: 'none', name: 'Side Fan' }],
    ]);
    expect(fanSeriesIdsForRole(map, 'cpu')).toEqual(new Set(['fan:1', 'fan:3']));
    expect(fanNamesForRole(map, 'cpu')).toEqual(['Front Fan', 'Rear Fan']);
    expect(fanSeriesIdsForRole(map, 'gpu')).toEqual(new Set(['fan:2']));
    expect(fanNamesForRole(map, 'gpu')).toEqual(['Top Fan']);
  });

  it('returns empty results for a role nothing is marked with', () => {
    const map = roleMap([['fan:1', { role: 'none', name: 'Front Fan' }]]);
    expect(fanSeriesIdsForRole(map, 'cpu')).toEqual(new Set());
    expect(fanNamesForRole(map, 'cpu')).toEqual([]);
  });

  it('returns empty results for an empty map', () => {
    expect(fanSeriesIdsForRole(new Map(), 'cpu')).toEqual(new Set());
    expect(fanNamesForRole(new Map(), 'cpu')).toEqual([]);
  });
});

describe('sumRpmSeriesForRole', () => {
  function fan(id: string, points: MetricHistorySeries['points']): MetricHistorySeries {
    return series(id, points, { kind: 'fan' });
  }

  it('sums only the fans whose id is in seriesIds, ignoring the rest', () => {
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }]);
    const fan2 = fan('fan:2', [{ t: 0, avg: 1600, max: 1500 }]);
    const fan3 = fan('fan:3', [{ t: 0, avg: 900, max: 950 }]);
    expect(sumRpmSeriesForRole([fan1, fan2, fan3], new Set(['fan:1', 'fan:2']))).toEqual([
      { t: 0, avg: 2800, max: 1500 },
    ]);
  });

  it('sums only the fans present at a timestamp - a marked fan missing a tick is not treated as 0 (gap-aware)', () => {
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }, { t: 1000, avg: 1240, max: 1280 }]);
    const fan2 = fan('fan:2', [{ t: 0, avg: 1600, max: 1500 }]);
    expect(sumRpmSeriesForRole([fan1, fan2], new Set(['fan:1', 'fan:2']))).toEqual([
      { t: 0, avg: 2800, max: 1500 },
      { t: 1000, avg: 1240, max: 1280 },
    ]);
  });

  it('ignores non-fan series and unmarked fan series', () => {
    const cpu = series('cpu', [{ t: 0, avg: 99, max: 99 }]);
    const fan1 = fan('fan:1', [{ t: 0, avg: 1200, max: 1250 }]);
    const fan2 = fan('fan:2', [{ t: 0, avg: 1600, max: 1500 }]);
    expect(sumRpmSeriesForRole([cpu, fan1, fan2], new Set(['fan:1']))).toEqual([
      { t: 0, avg: 1200, max: 1250 },
    ]);
  });

  it('returns an empty array for no series, or an empty seriesIds set', () => {
    expect(sumRpmSeriesForRole([], new Set(['fan:1']))).toEqual([]);
    expect(sumRpmSeriesForRole([fan('fan:1', [{ t: 0, avg: 1, max: 1 }])], new Set())).toEqual([]);
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
    const [a, b] = formatBrushEdgeLabels(start, end, 'system', 'en-US');
    expect(a.day).toBeUndefined();
    expect(b.day).toBeUndefined();
    expect(a.time).toMatch(/11:31:04/);
    expect(b.time).toMatch(/11:36:04/);
  });

  it('sets the short localized day on both labels when the edges span different days', () => {
    const start = new Date(2026, 6, 15, 23, 58, 0).getTime();
    const end = new Date(2026, 6, 16, 0, 3, 0).getTime();
    const [a, b] = formatBrushEdgeLabels(start, end, 'system', 'en-US');
    expect(a.day).toBe('Jul 15');
    expect(b.day).toBe('Jul 16');
    expect(a.time).not.toMatch(/Jul/);
    expect(b.time).not.toMatch(/Jul/);
  });
});

describe('resolveSelectedFrame (point-in-time snapshot)', () => {
  const domain: [number, number] = [1_000, 2_000];

  it('defaults to the window\'s own right edge when nothing is clicked', () => {
    const result = resolveSelectedFrame(null, domain);
    expect(result).toEqual({ selectedFrameMs: 2_000, isPinned: false });
  });

  it('pins to the clicked frame when it falls within the window', () => {
    const result = resolveSelectedFrame(1_500, domain);
    expect(result).toEqual({ selectedFrameMs: 1_500, isPinned: true });
  });

  it('treats the exact edges as within range', () => {
    expect(resolveSelectedFrame(1_000, domain)).toEqual({ selectedFrameMs: 1_000, isPinned: true });
    expect(resolveSelectedFrame(2_000, domain)).toEqual({ selectedFrameMs: 2_000, isPinned: true });
  });

  it('falls back to the right edge once a subsequent scrub moves the pinned point out of range', () => {
    // The user clicked at 1_500 in an earlier window, then scrubbed to a
    // window that no longer contains it.
    const result = resolveSelectedFrame(1_500, [3_000, 4_000]);
    expect(result).toEqual({ selectedFrameMs: 4_000, isPinned: false });
  });

  it('live is the case where nothing is pinned - the same right-edge default as following', () => {
    // domain[1] tracks real "now" while following (useMetricHistory's own
    // contract) - resolveSelectedFrame reads whatever domain[1] currently
    // is, with no separate following-aware branch.
    const liveDomain: [number, number] = [Date.now() - 60_000, Date.now()];
    expect(resolveSelectedFrame(null, liveDomain).selectedFrameMs).toBe(liveDomain[1]);
  });
});
