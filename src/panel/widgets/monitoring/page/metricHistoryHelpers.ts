// Pure helpers for the monitoring tabs' history chart (MetricHistorySection).
// Kept side-effect-free (no i18n context, no fetch) so they're covered
// directly by metricHistoryHelpers.test.ts instead of through component
// rendering. Mirrors the Cooling tab's temperatureHelpers.ts.
import { nearestPoint, type TimeSeriesPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import type { TimeSeriesBand, TimeSeriesSeries } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';

export type RangeKey = '1h' | '3h' | '12h' | '24h' | '3d' | '7d' | 'custom';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface RangeOption {
  key: Exclude<RangeKey, 'custom'>;
  windowMs: number;
  labelKey: string;
}

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { key: '1h', windowMs: HOUR_MS, labelKey: 'monitoring.history.range.1h' },
  { key: '3h', windowMs: 3 * HOUR_MS, labelKey: 'monitoring.history.range.3h' },
  { key: '12h', windowMs: 12 * HOUR_MS, labelKey: 'monitoring.history.range.12h' },
  { key: '24h', windowMs: DAY_MS, labelKey: 'monitoring.history.range.24h' },
  { key: '3d', windowMs: 3 * DAY_MS, labelKey: 'monitoring.history.range.3d' },
  { key: '7d', windowMs: 7 * DAY_MS, labelKey: 'monitoring.history.range.7d' },
];

const DEFAULT_RANGE_KEY: RangeKey = '1h';

// A brush-resized window within this tolerance of a preset's width is still
// reported as that preset (drag pixel rounding), not 'custom'.
const RANGE_MATCH_TOLERANCE_MS = 1_000;

export function windowMsForRangeKey(key: RangeKey): number | null {
  return RANGE_OPTIONS.find(o => o.key === key)?.windowMs ?? null;
}

/** The preset a window width matches, or 'custom' when it matches none. */
export function rangeKeyForWindow(windowMs: number): RangeKey {
  for (const opt of RANGE_OPTIONS) {
    if (Math.abs(opt.windowMs - windowMs) <= RANGE_MATCH_TOLERANCE_MS) return opt.key;
  }
  return 'custom';
}

export interface ViewportState {
  from: number;
  to: number;
  rangeKey: RangeKey;
  /** True while the viewport tracks the live edge (to === now, slides on tick). */
  following: boolean;
}

export type ViewportAction =
  | { type: 'init'; now: number }
  | { type: 'setRange'; key: RangeKey; now: number }
  | { type: 'brushChange'; from: number; to: number; now: number }
  | { type: 'tick'; now: number }
  | { type: 'retentionClamp'; retentionMs: number; now: number };

export function initViewport(now: number): ViewportState {
  const windowMs = windowMsForRangeKey(DEFAULT_RANGE_KEY) ?? HOUR_MS;
  return { from: now - windowMs, to: now, rangeKey: DEFAULT_RANGE_KEY, following: true };
}

/**
 * Owns the history chart's visible window. Selecting a preset always
 * re-anchors to the live right edge (right-edge anchored); dragging the
 * TimelineBrush detaches following unless the drag ends touching the live
 * edge (the brush's own 6px snap reports that as `to === now`); a live tick
 * only slides the window while still following, keeping the current width.
 */
export function viewportReducer(state: ViewportState, action: ViewportAction): ViewportState {
  switch (action.type) {
    case 'init':
      return initViewport(action.now);
    case 'setRange': {
      const windowMs = windowMsForRangeKey(action.key) ?? (state.to - state.from);
      return { from: action.now - windowMs, to: action.now, rangeKey: action.key, following: true };
    }
    case 'brushChange': {
      const following = action.to >= action.now;
      const to = following ? action.now : action.to;
      return { from: action.from, to, rangeKey: rangeKeyForWindow(to - action.from), following };
    }
    case 'tick': {
      if (!state.following) return state;
      const windowMs = state.to - state.from;
      return { ...state, from: action.now - windowMs, to: action.now };
    }
    case 'retentionClamp': {
      const minFrom = action.now - action.retentionMs;
      if (state.from >= minFrom) return state;
      return { ...state, from: minFrom, rangeKey: rangeKeyForWindow(state.to - minFrom) };
    }
    default:
      return state;
  }
}

/** X-axis tick label granularity appropriate to the visible window width. */
export function xTickFormatForWindow(windowMs: number): (t: number) => string {
  if (windowMs <= DAY_MS) return (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (windowMs < 7 * DAY_MS) return (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric' });
  return (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Maps the API's history series onto TimeSeriesChart's generic shape. */
export function toHistoryChartSeries(series: readonly MetricHistorySeries[], colorFor: (id: string) => string): TimeSeriesSeries[] {
  return series.map(s => ({
    id: s.id,
    name: s.name,
    color: colorFor(s.id),
    points: s.points.map(p => ({ t: p.t, avg: p.avg, max: p.max })),
  }));
}

export const CPU_TEMP_THRESHOLD_C = 85;
export const GPU_TEMP_THRESHOLD_C = 90;

/** Translucent bands over runs of adjacent points at/above thresholdC. */
export function tempBands(points: readonly TimeSeriesPoint[], thresholdC: number): TimeSeriesBand[] {
  if (points.length === 0) return [];
  const spacing = points.length > 1 ? points[1].t - points[0].t : 0;
  const bands: TimeSeriesBand[] = [];
  let start: number | null = null;
  let lastT = points[0].t;
  for (const p of points) {
    const over = p.avg >= thresholdC;
    if (over && start === null) start = p.t;
    if (!over && start !== null) {
      bands.push({ startT: start, endT: lastT + spacing });
      start = null;
    }
    lastT = p.t;
  }
  if (start !== null) bands.push({ startT: start, endT: lastT + spacing });
  return bands;
}

/** The temperature point nearest hovered timestamp `t`, for the chart's tooltipExtra row. */
export function nearestTempAt(points: readonly TimeSeriesPoint[], t: number, maxDeltaMs: number): TimeSeriesPoint | null {
  return nearestPoint(points, t, maxDeltaMs);
}

/** Sums matching-timestamp points across series into one silhouette line -
 *  the TimelineBrush minimap shows one backdrop even for a two-series metric
 *  (net-in + net-out). */
export function sumSilhouette(seriesList: readonly MetricHistorySeries[]): TimeSeriesPoint[] {
  const byT = new Map<number, { avg: number; max: number }>();
  for (const s of seriesList) {
    for (const p of s.points) {
      const cur = byT.get(p.t) ?? { avg: 0, max: 0 };
      byT.set(p.t, { avg: cur.avg + p.avg, max: cur.max + p.max });
    }
  }
  return [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, avg: v.avg, max: v.max }));
}

/**
 * Picks the history series for the GPU tab's currently selected adapter:
 * match by adapterLuid, fall back to a name match, then to the lone gpu
 * series when there's only one. Returns nulls when nothing resolves (the
 * caller hides the section rather than showing an unrelated GPU's data).
 */
export function pickGpuHistorySeries(
  series: readonly MetricHistorySeries[],
  adapterLuid: string,
  gpuName: string,
): { load: MetricHistorySeries | null; temp: MetricHistorySeries | null } {
  const loads = series.filter(s => s.kind === 'gpu');
  const temps = series.filter(s => s.kind === 'gpu-temp');
  const load = (adapterLuid ? loads.find(s => s.adapterLuid === adapterLuid) : undefined)
    ?? loads.find(s => s.name === gpuName)
    ?? (loads.length === 1 ? loads[0] : undefined)
    ?? null;
  if (!load) return { load: null, temp: null };
  const temp = (load.adapterLuid ? temps.find(s => s.adapterLuid === load.adapterLuid) : undefined)
    ?? temps.find(s => s.name === load.name)
    ?? (temps.length === 1 ? temps[0] : undefined)
    ?? null;
  return { load, temp };
}
