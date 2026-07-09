// Pure geometry/data helpers for TimeSeriesChart, kept side-effect-free (no
// React, no i18n) so they're covered directly by timeSeriesChartUtils.test.ts
// instead of through component rendering.

export interface TimeSeriesPoint {
  t: number;
  avg: number;
  max: number;
}

export interface TimeSeriesSeries {
  id: string;
  name: string;
  color: string;
  points: TimeSeriesPoint[];
}

/**
 * Splits a series' points into runs with no gap wider than maxGapMs, so a
 * missing bucket renders as a broken line instead of an interpolated one.
 * Points are assumed sorted ascending by t.
 */
export function splitIntoSegments(points: readonly TimeSeriesPoint[], maxGapMs: number): TimeSeriesPoint[][] {
  if (points.length === 0) return [];
  const segments: TimeSeriesPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (cur.t - prev.t > maxGapMs) segments.push([cur]);
    else segments[segments.length - 1].push(cur);
  }
  return segments;
}

/** [min, max] timestamp across every series, or null when there are no points at all. */
export function timeDomain(series: readonly TimeSeriesSeries[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.t < min) min = p.t;
      if (p.t > max) max = p.t;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return [min, max];
}

/** [min, max] avg value across every series, padded to a non-zero span. Defaults to [0, 1] when empty. */
export function valueDomain(series: readonly TimeSeriesSeries[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.avg < min) min = p.avg;
      if (p.avg > max) max = p.avg;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

/**
 * "Nice" round tick values spanning [min, max] with roughly targetCount
 * ticks, d3-style (1/2/5 * 10^n steps).
 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let step: number;
  if (residual >= 5) step = 10 * magnitude;
  else if (residual >= 2) step = 5 * magnitude;
  else if (residual >= 1) step = 2 * magnitude;
  else step = magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * The point nearest targetT, or null when the nearest point is farther than
 * maxDeltaMs away (so a hover between two very different series' buckets
 * doesn't falsely attach a value to a series with no data near the cursor).
 */
export function nearestPoint(points: readonly TimeSeriesPoint[], targetT: number, maxDeltaMs: number): TimeSeriesPoint | null {
  let best: TimeSeriesPoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = Math.abs(p.t - targetT);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = p;
    }
  }
  return best && bestDelta <= maxDeltaMs ? best : null;
}
