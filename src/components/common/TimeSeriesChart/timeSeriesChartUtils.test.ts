import { describe, expect, it } from 'vitest';
import {
  avgValueRange,
  clusterChartEvents,
  formatTooltipTimestamp,
  GAP_MULTIPLIER,
  medianSpacingMs,
  medianSpacingOfPoints,
  nearestPoint,
  niceTicks,
  resolveValueDomain,
  ribbonOpacityFraction,
  splitIntoSegments,
  timeDomain,
  valueDomain,
  type TimeSeriesPoint,
  type TimeSeriesSeries,
} from './timeSeriesChartUtils';

function pt(t: number, avg: number, max = avg): TimeSeriesPoint {
  return { t, avg, max };
}

function ev(id: number | string, t: number, kind = 'app-open') {
  return { id, t, kind, label: `event-${id}`, detail: null as string | null, custom: false, endT: null as number | null };
}

// 1px per ms, for simple/predictable pixel-collision math.
const identityXFor = (t: number) => t;

describe('medianSpacingMs', () => {
  it('returns the median delta across every series pooled together', () => {
    const series: TimeSeriesSeries[] = [
      { id: 'a', name: 'A', color: '#fff', points: [pt(0, 1), pt(100, 2), pt(200, 3)] },
      { id: 'b', name: 'B', color: '#000', points: [pt(0, 1), pt(100, 2)] },
    ];
    expect(medianSpacingMs(series)).toBe(100);
  });

  it('reflects decimated (widened) spacing, not any nominal bucket size', () => {
    const series: TimeSeriesSeries[] = [
      { id: 'a', name: 'A', color: '#fff', points: [pt(0, 1), pt(1_200_000, 2), pt(2_400_000, 3), pt(3_600_000, 4)] },
    ];
    expect(medianSpacingMs(series)).toBe(1_200_000);
  });

  it('returns null when no series has two or more points', () => {
    const series: TimeSeriesSeries[] = [{ id: 'a', name: 'A', color: '#fff', points: [pt(0, 1)] }];
    expect(medianSpacingMs(series)).toBeNull();
  });

  it('returns null for no series at all', () => {
    expect(medianSpacingMs([])).toBeNull();
  });
});

describe('splitIntoSegments', () => {
  it('keeps evenly spaced points in one segment', () => {
    const points = [pt(0, 1), pt(300_000, 2), pt(600_000, 3)];
    expect(splitIntoSegments(points, 400_000)).toEqual([points]);
  });

  it('breaks the run where a gap exceeds the threshold', () => {
    const points = [pt(0, 1), pt(300_000, 2), pt(3_000_000, 3)];
    expect(splitIntoSegments(points, 400_000)).toEqual([
      [points[0], points[1]],
      [points[2]],
    ]);
  });

  it('returns an empty array for no points', () => {
    expect(splitIntoSegments([], 1000)).toEqual([]);
  });

  it('returns a single one-point segment for a single point', () => {
    const points = [pt(0, 1)];
    expect(splitIntoSegments(points, 1000)).toEqual([points]);
  });
});

describe('per-series gap threshold (TimeSeriesChart segmentsBySeries)', () => {
  const MIN = 60_000;

  it('a chart-wide pooled threshold isolates every point of a series sparser than its sibling', () => {
    const dense: TimeSeriesSeries = {
      id: 'cpu', name: 'CPU', color: '#fff',
      points: Array.from({ length: 30 }, (_, i) => pt(i * 30_000, i)),
    };
    const sparse: TimeSeriesSeries = {
      id: 'app', name: 'chrome.exe', color: '#f97316',
      points: Array.from({ length: 6 }, (_, i) => pt(i * 5 * MIN, i)),
    };
    const pooledGapMs = medianSpacingMs([dense, sparse])! * GAP_MULTIPLIER;
    const segments = splitIntoSegments(sparse.points, pooledGapMs);
    expect(segments).toHaveLength(sparse.points.length);
    expect(segments.every(seg => seg.length === 1)).toBe(true);
  });

  it('a threshold derived from the series\' own spacing keeps that same sparse series connected', () => {
    const sparse: TimeSeriesSeries = {
      id: 'app', name: 'chrome.exe', color: '#f97316',
      points: Array.from({ length: 6 }, (_, i) => pt(i * 5 * MIN, i)),
    };
    const ownGapMs = medianSpacingOfPoints(sparse.points)! * GAP_MULTIPLIER;
    const segments = splitIntoSegments(sparse.points, ownGapMs);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(sparse.points.length);
  });
});

describe('timeDomain', () => {
  it('spans the earliest and latest timestamp across every series', () => {
    const series: TimeSeriesSeries[] = [
      { id: 'a', name: 'A', color: '#fff', points: [pt(100, 1), pt(500, 2)] },
      { id: 'b', name: 'B', color: '#000', points: [pt(0, 1), pt(300, 2)] },
    ];
    expect(timeDomain(series)).toEqual([0, 500]);
  });

  it('returns null when every series is empty', () => {
    const series: TimeSeriesSeries[] = [{ id: 'a', name: 'A', color: '#fff', points: [] }];
    expect(timeDomain(series)).toBeNull();
  });
});

describe('valueDomain', () => {
  it('spans the min and max avg across every series', () => {
    const series: TimeSeriesSeries[] = [
      { id: 'a', name: 'A', color: '#fff', points: [pt(0, 40), pt(1, 60)] },
      { id: 'b', name: 'B', color: '#000', points: [pt(0, 30), pt(1, 50)] },
    ];
    expect(valueDomain(series)).toEqual([30, 60]);
  });

  it('pads a flat series so the domain is never zero-width', () => {
    const series: TimeSeriesSeries[] = [{ id: 'a', name: 'A', color: '#fff', points: [pt(0, 40), pt(1, 40)] }];
    expect(valueDomain(series)).toEqual([39, 41]);
  });

  it('defaults to [0, 1] when there are no points at all', () => {
    expect(valueDomain([])).toEqual([0, 1]);
  });
});

describe('resolveValueDomain', () => {
  const series: TimeSeriesSeries[] = [
    { id: 'a', name: 'A', color: '#fff', points: [pt(0, 40), pt(1, 60)] },
  ];

  it('matches the pure data domain when forced is omitted (backwards compatible)', () => {
    expect(resolveValueDomain(series)).toEqual(valueDomain(series));
  });

  it('pins both bounds for a percent chart regardless of the data', () => {
    expect(resolveValueDomain(series, [0, 100])).toEqual([0, 100]);
  });

  it('pins the floor while the ceiling still auto-scales to the data (network)', () => {
    expect(resolveValueDomain(series, [0, null])).toEqual([0, 60]);
  });

  it('pins the ceiling while the floor still auto-scales to the data', () => {
    expect(resolveValueDomain(series, [null, 100])).toEqual([40, 100]);
  });

  it('pads a degenerate forced domain so it is never zero-width', () => {
    expect(resolveValueDomain(series, [50, 50])).toEqual([49, 51]);
  });
});

describe('niceTicks', () => {
  it('produces round steps covering the domain', () => {
    const ticks = niceTicks(2, 93, 5);
    expect(ticks[0]).toBeLessThanOrEqual(2);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(93);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(ticks[1] - ticks[0], 6);
    }
  });

  it('falls back to a single tick for a degenerate domain', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe('nearestPoint', () => {
  const points = [pt(0, 10), pt(1000, 20), pt(2000, 30)];

  it('picks the closest point within range', () => {
    expect(nearestPoint(points, 900, 500)?.avg).toBe(20);
  });

  it('returns null when nothing is within maxDeltaMs', () => {
    expect(nearestPoint(points, 900, 50)).toBeNull();
  });

  it('returns null for an empty point list', () => {
    expect(nearestPoint([], 0, 1000)).toBeNull();
  });
});

describe('ribbonOpacityFraction', () => {
  it('pins both ends of the range', () => {
    expect(ribbonOpacityFraction(0, 0, 100)).toBe(0);
    expect(ribbonOpacityFraction(100, 0, 100)).toBe(1);
  });

  it('maps linearly, with no amplification', () => {
    expect(ribbonOpacityFraction(25, 0, 100)).toBeCloseTo(0.25, 10);
    expect(ribbonOpacityFraction(50, 0, 100)).toBeCloseTo(0.5, 10);
    expect(ribbonOpacityFraction(75, 0, 100)).toBeCloseTo(0.75, 10);
  });

  it('is monotonically increasing', () => {
    const samples = [0, 10, 20, 40, 60, 80, 100].map(v => ribbonOpacityFraction(v, 0, 100));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it('clamps a value outside [min, max] instead of going out of range', () => {
    expect(ribbonOpacityFraction(-50, 0, 100)).toBe(0);
    expect(ribbonOpacityFraction(150, 0, 100)).toBe(1);
  });

  it('maps a degenerate range (min === max) to a constant mid fraction instead of dividing by zero', () => {
    expect(ribbonOpacityFraction(50, 50, 50)).toBe(0.5);
    expect(Number.isNaN(ribbonOpacityFraction(50, 50, 50))).toBe(false);
  });
});

describe('avgValueRange', () => {
  it('returns [min, max] of avg across the points', () => {
    expect(avgValueRange([pt(0, 40), pt(1, 90), pt(2, 60)])).toEqual([40, 90]);
  });

  it('returns [v, v] for a single point', () => {
    expect(avgValueRange([pt(0, 55)])).toEqual([55, 55]);
  });

  it('returns null for an empty point list', () => {
    expect(avgValueRange([])).toBeNull();
  });
});

describe('formatTooltipTimestamp', () => {
  const nowMs = new Date('2026-07-08T12:00:00Z').getTime();

  it('includes minutes precision regardless of a coarser axis-tick format', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'system', 'en-US')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('omits the year when the timestamp falls in the same year as now', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'system', 'en-US')).not.toContain('2026');
  });

  it('includes the year when the timestamp falls in a different year than now', () => {
    const t = new Date('2024-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'system', 'en-US')).toContain('2024');
  });

  // The Units > Time format setting, not the browser locale, decides the hour
  // cycle - an en-US user who picks 24-hour must not get AM/PM back.
  it('honours the Time format setting over the locale default', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, '24h', 'en-US')).not.toMatch(/[AP]M/i);
    expect(formatTooltipTimestamp(t, nowMs, '12h', 'de-DE')).toMatch(/[AP]M/i);
  });

  it('formats according to the supplied locale', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    const de = formatTooltipTimestamp(t, nowMs, 'system', 'de-DE');
    const en = formatTooltipTimestamp(t, nowMs, 'system', 'en-US');
    expect(de).not.toBe(en);
  });

  // Local-time constructors (not UTC ISO strings) so the same-day/
  // different-day boundary is independent of the test runner's timezone,
  // matching the getFullYear/getMonth/getDate (local) getters the
  // implementation itself uses - same approach as formatBrushEdgeLabels'
  // own tests in metricHistoryHelpers.test.ts.
  const sameDayNowMs = new Date(2026, 6, 8, 12, 0, 0).getTime();

  it('omits the date entirely when the timestamp falls on the same calendar day as now', () => {
    const t = new Date(2026, 6, 8, 9, 15, 0).getTime();
    const formatted = formatTooltipTimestamp(t, sameDayNowMs, 'system', 'en-US');
    expect(formatted).not.toMatch(/Jul/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows the date when the timestamp falls on a different calendar day than now, even within the same week', () => {
    const t = new Date(2026, 6, 7, 9, 15, 0).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'system', 'en-US')).toMatch(/Jul/);
  });

  it('omits seconds by default (no stepSeconds supplied)', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'system', 'en-US')).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('omits seconds when stepSeconds is 60 or coarser', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'system', 'en-US', 60)).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('includes seconds when stepSeconds is sub-minute', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'system', 'en-US', 1)).toMatch(/:\d{2}:\d{2}/);
  });
});

describe('clusterChartEvents', () => {
  it('returns one cluster per event when they are all far apart', () => {
    const events = [ev(1, 0), ev(2, 1000), ev(3, 2000)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(3);
    expect(clusters.map(c => c.events.length)).toEqual([1, 1, 1]);
  });

  it('merges events within the threshold into one cluster', () => {
    const events = [ev(1, 0), ev(2, 5), ev(3, 9)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].events.map(e => e.id)).toEqual([1, 2, 3]);
  });

  it('keeps a cluster anchored at its earliest member instead of transitively chaining', () => {
    // Each event is tested against the CLUSTER'S OWN anchor (its first
    // member), not the previous event - so 16 does not merge with 8 (16-0=16
    // > threshold) even though 16-8=8 is within it, and starts a new cluster.
    const events = [ev(1, 0), ev(2, 8), ev(3, 16), ev(4, 24)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].x).toBe(0);
    expect(clusters[0].events.map(e => e.id)).toEqual([1, 2]);
    expect(clusters[1].x).toBe(16);
    expect(clusters[1].events.map(e => e.id)).toEqual([3, 4]);
  });

  it('does not merge two events exactly one pixel past the threshold', () => {
    const events = [ev(1, 0), ev(2, 11)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(2);
  });

  it('merges two events exactly at the threshold (inclusive)', () => {
    const events = [ev(1, 0), ev(2, 10)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(1);
  });

  it('merges same-pixel collisions even at a zero threshold', () => {
    const events = [ev(1, 5), ev(2, 5)];
    const clusters = clusterChartEvents(events, identityXFor, 0);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].events).toHaveLength(2);
  });

  it('clusters out-of-order input by sorting on t first', () => {
    const events = [ev(3, 2000), ev(1, 0), ev(2, 5)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].events.map(e => e.id)).toEqual([1, 2]);
    expect(clusters[1].events.map(e => e.id)).toEqual([3]);
  });

  it('returns an empty array for no events', () => {
    expect(clusterChartEvents([], identityXFor, 10)).toEqual([]);
  });

  it('supports string ids (derived events have no numeric id)', () => {
    const events = [ev('privacy:webcam:100', 0)];
    const clusters = clusterChartEvents(events, identityXFor, 10);
    expect(clusters[0].events[0].id).toBe('privacy:webcam:100');
  });
});
