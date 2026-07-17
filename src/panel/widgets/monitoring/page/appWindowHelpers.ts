// Pure helpers for the window-scoped per-app data (GET /monitoring/history/
// apps): binary-search nearest-point lookup for the hover tooltip (no
// per-hover fetching - the whole window's points already sit in memory) and
// the mapping into ProcessListSection's row shape. Kept side-effect-free so
// it's covered directly by appWindowHelpers.test.ts.
import type { AppWindowPoint, AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import type { ProcessListItem } from './ProcessListSection';

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
 *  the sparkline's x-range is the chart window), color uniform (accent-only,
 *  per the monitoring redesign - rows disambiguate by name, not color). */
export function appsToProcessListItems(apps: readonly AppWindowSeries[]): ProcessListItem[] {
  return apps.map(app => ({
    name: app.name,
    color: 'var(--accent)',
    current: app.avg,
    values: app.points.map(p => p.avg),
    startedAtMs: app.startedAtMs,
  }));
}
