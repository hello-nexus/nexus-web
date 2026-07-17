// Pure helpers for the window-scoped per-app data (GET /monitoring/history/
// apps): binary-search nearest-point lookup for the hover tooltip (no
// per-hover fetching - the whole window's points already sit in memory) and
// the mapping into ProcessListSection's row shape. Kept side-effect-free so
// it's covered directly by appWindowHelpers.test.ts.
import {
  GAP_MULTIPLIER, medianSpacingOfPoints,
} from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import type { AppWindowPoint, AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import { SPARKLINE_SAMPLES, type ProcessListItem } from './ProcessListSection';

/** Index of the point nearest `target` in an ascending-by-t array, via
 *  binary search. -1 for an empty array. */
export function nearestPointIndex(points: readonly AppWindowPoint[], target: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].t - target) <= Math.abs(points[lo].t - target)) return lo - 1;
  return lo;
}

/** The value of an app's series nearest hover timestamp `t`, or null when
 *  the series has no points at all. */
export function nearestAppValueAt(points: readonly AppWindowPoint[], t: number): number | null {
  const i = nearestPointIndex(points, t);
  return i >= 0 ? points[i].avg : null;
}

export interface HoverAppEntry {
  name: string;
  value: number;
}

/** The top `limit` apps AT the hovered instant, re-ranked by their value at
 *  that instant (not the window-average ranking the fetch itself used) -
 *  reads each app's nearest point client-side, no fetching. */
export function topAppsAtHover(apps: readonly AppWindowSeries[], hoverT: number, limit: number): HoverAppEntry[] {
  const entries: HoverAppEntry[] = [];
  for (const app of apps) {
    const value = nearestAppValueAt(app.points, hoverT);
    if (value !== null) entries.push({ name: app.name, value });
  }
  return entries.sort((a, b) => b.value - a.value).slice(0, limit);
}

/** Maps a window-scoped apps response onto ProcessListSection's row shape -
 *  current = the window average, values = the window's own point series (so
 *  the sparkline's x-range is the chart window). Rows disambiguate by name
 *  and icon only - no per-app color, per the monitoring redesign.
 *  isApp/publisher/signed have no equivalent on the window endpoint, so a
 *  detached/scrubbed view looks them up by name from the live list instead -
 *  a still-running process keeps its live classification even while the
 *  metric values themselves show a past window. */
export function appsToProcessListItems(apps: readonly AppWindowSeries[], liveItems: readonly ProcessListItem[]): ProcessListItem[] {
  const liveByName = new Map(liveItems.map(i => [i.name, i] as const));
  return apps.map(app => {
    const live = liveByName.get(app.name);
    return {
      name: app.name,
      current: app.avg,
      values: app.points.map(p => p.avg),
      startedAtMs: app.startedAtMs,
      isApp: live?.isApp,
      publisher: live?.publisher,
      signed: live?.signed,
    };
  });
}

function flatHistory(value: number): number[] {
  return new Array(SPARKLINE_SAMPLES).fill(value);
}

/**
 * Reconciles the complete live process list (item 48) against the
 * window-scoped apps response for the same metric: a name present in both
 * keeps the window's own avg + point series (so it lines up with the hero
 * chart's own data and the hover tooltip); a name live-only - the window
 * response is a top-N-by-usage subset, or the endpoint returned nothing at
 * all for this series - keeps its own live sparkline when it has one
 * (real per-process history beats a fabricated flat line), falling back to a
 * flat line only when the live row itself carries no history. A name that
 * only appears in the window response (e.g. it exited between the live
 * frame and the window fetch) is still included, sourced from the window
 * data alone, so nothing the window legitimately reports is dropped.
 * Window names collide case-sensitively; a duplicate keeps the first entry
 * and drops the rest, since ProcessListSection keys rows by name.
 */
export function reconcileLiveWithWindow(
  liveItems: readonly ProcessListItem[],
  windowApps: readonly AppWindowSeries[],
): ProcessListItem[] {
  const windowByName = new Map<string, AppWindowSeries>();
  for (const app of windowApps) {
    if (!windowByName.has(app.name)) windowByName.set(app.name, app);
  }
  const seen = new Set<string>();
  const result: ProcessListItem[] = [];

  for (const live of liveItems) {
    if (seen.has(live.name)) continue;
    seen.add(live.name);
    const windowed = windowByName.get(live.name);
    if (windowed) {
      result.push({
        name: live.name,
        current: windowed.avg,
        values: windowed.points.map(p => p.avg),
        startedAtMs: windowed.startedAtMs,
        secondary: live.secondary,
        isApp: live.isApp,
        publisher: live.publisher,
        signed: live.signed,
      });
    } else if (live.values.length > 0) {
      result.push(live);
    } else {
      result.push({ ...live, values: flatHistory(live.current) });
    }
  }

  for (const windowed of windowByName.values()) {
    if (seen.has(windowed.name)) continue;
    seen.add(windowed.name);
    result.push({
      name: windowed.name,
      current: windowed.avg,
      values: windowed.points.map(p => p.avg),
      startedAtMs: windowed.startedAtMs,
    });
  }

  return result;
}

/**
 * GPU tab fallback (item 51) for when the adapter reports no per-process GPU
 * telemetry at all: shows the general running-process list with GPU usage
 * zeroed out instead of an empty tab.
 */
export function zeroedGpuFallback(liveItems: readonly ProcessListItem[]): ProcessListItem[] {
  return liveItems.map(item => ({
    name: item.name,
    current: 0,
    values: item.values.map(() => 0),
    startedAtMs: item.startedAtMs,
    isApp: item.isApp,
    publisher: item.publisher,
    signed: item.signed,
  }));
}

// Defensive cap on synthetic points per response (item 52) - guards against
// a malformed/highly irregular response; realistic responses (points spaced
// on the window's own decimation grid) never approach it.
const MAX_FILLED_POINTS = 500;

/**
 * Fills within-window absence as zero for a per-app window series (item 52):
 * the service only records an app while it ranks in its own top-N-by-usage
 * feed, so a mid-rank app's points have gaps where it was running at ~0%
 * usage and fell out of that ranking - not genuine downtime. A gap wider
 * than the series' own median spacing (the same GAP_MULTIPLIER threshold
 * TimeSeriesChart uses to decide a gap is "real") is filled with zero-value
 * points at that spacing, so both the row's mini-sparkline and the
 * clicked-app usage chart (which breaks its line on the same threshold) read
 * as one continuous run instead of a broken/sparse one. Nothing is filled
 * before the first recorded sample or after the last - an app's own
 * observed lifetime still bounds the result. A system-wide series (not
 * per-app) never goes through this, so a genuine service-downtime gap stays
 * a gap.
 */
export function fillAppGaps(points: readonly AppWindowPoint[]): AppWindowPoint[] {
  if (points.length < 2) return points as AppWindowPoint[];
  const spacing = medianSpacingOfPoints(points);
  if (!spacing || spacing <= 0) return points as AppWindowPoint[];
  const maxGapMs = spacing * GAP_MULTIPLIER;

  const filled: AppWindowPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const gap = cur.t - prev.t;
    if (gap > maxGapMs) {
      // Reserves room for `cur` itself, pushed unconditionally below, so
      // `filled.length` never exceeds MAX_FILLED_POINTS.
      const budget = MAX_FILLED_POINTS - filled.length - 1;
      const steps = Math.min(Math.round(gap / spacing) - 1, budget);
      for (let s = 1; s <= steps; s++) filled.push({ t: prev.t + s * spacing, avg: 0 });
    }
    filled.push(cur);
    if (filled.length >= MAX_FILLED_POINTS) return filled;
  }
  return filled;
}
