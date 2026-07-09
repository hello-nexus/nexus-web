import { describe, expect, it } from 'vitest';
import {
  medianSpacingMs,
  nearestPoint,
  niceTicks,
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
