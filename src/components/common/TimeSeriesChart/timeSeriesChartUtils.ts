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

// A gap wider than this multiple of the actual median point spacing renders
// as a line break (and the hover tooltip stops attaching a series' value).
// Derived from the data itself, not a nominal bucket size: server-side
// decimation widens real point spacing well past the source bucket at wide
// ranges, so a caller-supplied nominal size would flag every decimated point
// as a gap and render the whole chart blank. Exported so companion visuals
// sharing the same underlying data (e.g. TimelineBrush's seek-bar
// silhouette) apply the identical gap-vs-interpolation rule.
export const GAP_MULTIPLIER = 1.5;

function pooledMedianDelta(pointArrays: readonly (readonly { t: number }[])[]): number | null {
  const deltas: number[] = [];
  for (const points of pointArrays) {
    for (let i = 1; i < points.length; i++) {
      deltas.push(points[i].t - points[i - 1].t);
    }
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
}

/**
 * Median gap between consecutive points, pooled across every series, or
 * null when there are fewer than two points anywhere to measure a gap from.
 * Server-side decimation widens the actual point spacing well past the
 * source bucket size at wide ranges, so gap/hover thresholds must derive
 * from this instead of a caller-supplied nominal bucket size - otherwise
 * every decimated point looks like an isolated gap and the chart renders
 * blank.
 */
export function medianSpacingMs(series: readonly TimeSeriesSeries[]): number | null {
  return pooledMedianDelta(series.map(s => s.points));
}

/** Same median-gap algorithm as medianSpacingMs, generalized to a single
 *  ascending point list (any shape carrying `t`) - lets a companion visual
 *  fed a different point shape (TimelineBrush's { t, v } silhouette) share
 *  the exact gap-detection math instead of reimplementing it. */
export function medianSpacingOfPoints(points: readonly { t: number }[]): number | null {
  return pooledMedianDelta([points]);
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
 * Resolves the chart's y-axis bounds: each side of `forced` (when given)
 * overrides that side of the data-derived valueDomain - null means "derive
 * this side from the data" (e.g. [0, null] pins the floor at zero but still
 * auto-scales the ceiling to the data, [0, 100] pins both for a percent
 * chart). Omitting `forced` entirely keeps today's pure data-driven domain.
 */
export function resolveValueDomain(series: readonly TimeSeriesSeries[], forced?: readonly [number | null, number | null]): [number, number] {
  const [dataMin, dataMax] = valueDomain(series);
  if (!forced) return [dataMin, dataMax];
  const min = forced[0] ?? dataMin;
  const max = forced[1] ?? dataMax;
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

/**
 * The full precise timestamp for the hover tooltip header, independent of
 * the caller's xTickFormat axis-tick granularity (which drops the time
 * component entirely past a 7-day range). Day-aware the same way the
 * seek-bar's edge labels are (formatBrushEdgeLabels in
 * metricHistoryHelpers.ts): the date is dropped entirely when t falls on
 * the same calendar day as nowMs, and the year is dropped when it falls in
 * the same year. Seconds appear only when `stepSeconds` (the chart's
 * current effective point spacing) is sub-minute - at a coarse zoom level a
 * seconds digit is meaningless precision the data doesn't actually have.
 */
export function formatTooltipTimestamp(t: number, nowMs: number, locale?: string, stepSeconds?: number | null): string {
  const at = new Date(t);
  const now = new Date(nowMs);
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  const sameYear = at.getFullYear() === now.getFullYear();
  const showSeconds = stepSeconds != null && stepSeconds < 60;
  return at.toLocaleString(locale, {
    year: sameYear ? undefined : 'numeric',
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
  });
}
