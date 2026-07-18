import { describe, expect, it } from 'vitest';
import {
  formatTooltipTimestamp,
  medianSpacingMs,
  nearestPoint,
  niceTicks,
  resolveValueDomain,
  ribbonThicknessFraction,
  splitIntoSegments,
  timeDomain,
  valueDomain,
  type TimeSeriesPoint,
  type TimeSeriesSeries,
} from './timeSeriesChartUtils';

function pt(t: number, avg: number, max = avg): TimeSeriesPoint {
  return { t, avg, max };
}

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

describe('ribbonThicknessFraction', () => {
  it('pins both ends of the domain', () => {
    expect(ribbonThicknessFraction(0)).toBe(0);
    expect(ribbonThicknessFraction(1)).toBe(1);
  });

  it('amplifies every fraction strictly between the two ends above its own linear value', () => {
    for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(ribbonThicknessFraction(f)).toBeGreaterThan(f);
    }
  });

  it('is monotonically increasing', () => {
    const samples = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1].map(ribbonThicknessFraction);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it('clamps a fraction outside [0, 1] instead of going imaginary or negative', () => {
    expect(ribbonThicknessFraction(-0.5)).toBe(0);
    expect(ribbonThicknessFraction(1.5)).toBe(1);
  });
});

describe('formatTooltipTimestamp', () => {
  const nowMs = new Date('2026-07-08T12:00:00Z').getTime();

  it('includes minutes precision regardless of a coarser axis-tick format', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'en-US')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('omits the year when the timestamp falls in the same year as now', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'en-US')).not.toContain('2026');
  });

  it('includes the year when the timestamp falls in a different year than now', () => {
    const t = new Date('2024-06-10T14:32:00Z').getTime();
    expect(formatTooltipTimestamp(t, nowMs, 'en-US')).toContain('2024');
  });

  it('formats according to the supplied locale', () => {
    const t = new Date('2026-06-10T14:32:00Z').getTime();
    const de = formatTooltipTimestamp(t, nowMs, 'de-DE');
    const en = formatTooltipTimestamp(t, nowMs, 'en-US');
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
    const formatted = formatTooltipTimestamp(t, sameDayNowMs, 'en-US');
    expect(formatted).not.toMatch(/Jul/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows the date when the timestamp falls on a different calendar day than now, even within the same week', () => {
    const t = new Date(2026, 6, 7, 9, 15, 0).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'en-US')).toMatch(/Jul/);
  });

  it('omits seconds by default (no stepSeconds supplied)', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'en-US')).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('omits seconds when stepSeconds is 60 or coarser', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'en-US', 60)).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('includes seconds when stepSeconds is sub-minute', () => {
    const t = new Date(2026, 6, 8, 14, 32, 15).getTime();
    expect(formatTooltipTimestamp(t, sameDayNowMs, 'en-US', 1)).toMatch(/:\d{2}:\d{2}/);
  });
});
