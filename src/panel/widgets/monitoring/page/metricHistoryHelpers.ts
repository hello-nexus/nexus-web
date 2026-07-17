// Pure helpers for the monitoring tabs' history chart (MetricHistorySection).
// Kept side-effect-free (no i18n context, no fetch) so they're covered
// directly by metricHistoryHelpers.test.ts instead of through component
// rendering. Mirrors the Cooling tab's temperatureHelpers.ts.
import { nearestPoint, type TimeSeriesPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import type { TimeSeriesSeries } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { MIN_BOX_WINDOW_MS } from '../../../../components/common/TimelineBrush/timelineBrushUtils';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';

export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'gpu';

export function seriesQueryFor(metric: HistoryMetric): string {
  switch (metric) {
    case 'cpu': return 'cpu,cpu-temp';
    case 'memory': return 'memory';
    case 'network': return 'net-in,net-out';
    case 'gpu': return 'gpu,gpu-temp';
  }
}

export type RangeKey = '30m' | '3h' | '24h' | '3d' | '7d' | 'custom';
export type PresetKey = Exclude<RangeKey, 'custom'>;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface RangeOption {
  key: PresetKey;
  windowMs: number;
  labelKey: string;
}

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { key: '30m', windowMs: 30 * MINUTE_MS, labelKey: 'monitoring.history.range.30m' },
  { key: '3h', windowMs: 3 * HOUR_MS, labelKey: 'monitoring.history.range.3h' },
  { key: '24h', windowMs: DAY_MS, labelKey: 'monitoring.history.range.24h' },
  { key: '3d', windowMs: 3 * DAY_MS, labelKey: 'monitoring.history.range.3d' },
  { key: '7d', windowMs: 7 * DAY_MS, labelKey: 'monitoring.history.range.7d' },
];

const DEFAULT_RANGE_KEY: PresetKey = '30m';

// A strip width within this tolerance of a preset's width is still reported
// as that preset (retention-clamp rounding), not 'custom'.
const RANGE_MATCH_TOLERANCE_MS = 1_000;

// The seek-bar strip is this many times wider than the chart-window (box) it
// contains by default, so the box highlights only the most recent sixth of
// the strip - floored by MIN_BOX_WINDOW_MS so a narrow strip (the smallest
// preset) can still legitimately fill the whole strip. At the smallest
// preset (30m) this lands exactly on the floor: a 5-minute box in a
// 30-minute strip.
const STRIP_TO_BOX_RATIO = 6;

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

/** The default chart-window (box) width for a strip of `stripWidthMs`: a
 *  sixth of the strip, floored at MIN_BOX_WINDOW_MS (and re-capped at the
 *  strip width itself, since the floor can exceed a narrow strip - the box
 *  then simply fills it, matching the smallest preset). */
export function defaultBoxWidthMs(stripWidthMs: number): number {
  return Math.min(stripWidthMs, Math.max(MIN_BOX_WINDOW_MS, stripWidthMs / STRIP_TO_BOX_RATIO));
}

export interface ViewportState {
  /** The hero chart's plotted window - always within [stripFrom, stripTo]. */
  from: number;
  to: number;
  /** The seek-bar strip's own span - exactly the active preset's width while
   *  rangeKey names one; re-derived around the selection once a chart
   *  drag-select breaks the preset (rangeKey becomes 'custom'). */
  stripFrom: number;
  stripTo: number;
  rangeKey: RangeKey;
  /** The last non-custom preset - lets the range control offer a one-click
   *  way back to it once a chart drag-select goes custom. */
  lastPresetKey: PresetKey;
  /** True while the viewport tracks the live edge (to === now, slides on tick). */
  following: boolean;
}

export type ViewportAction =
  | { type: 'init'; now: number }
  | { type: 'setRange'; key: PresetKey; now: number }
  | { type: 'brushChange'; from: number; to: number; now: number }
  | { type: 'chartDragSelect'; from: number; to: number; now: number; retentionMs: number }
  | { type: 'tick'; now: number }
  | { type: 'retentionClamp'; retentionMs: number; now: number }
  | { type: 'backToLive'; now: number };

export function initViewport(now: number): ViewportState {
  const stripWidth = windowMsForRangeKey(DEFAULT_RANGE_KEY) ?? 30 * MINUTE_MS;
  const boxWidth = defaultBoxWidthMs(stripWidth);
  return {
    from: now - boxWidth, to: now,
    stripFrom: now - stripWidth, stripTo: now,
    rangeKey: DEFAULT_RANGE_KEY, lastPresetKey: DEFAULT_RANGE_KEY, following: true,
  };
}

/** Centers [start, end] (preserving its span where possible) inside
 *  [floor, ceiling], shifting rather than truncating. */
function clampSpanShift(start: number, end: number, floor: number, ceiling: number): [number, number] {
  let s = start;
  let e = end;
  if (e > ceiling) { s -= e - ceiling; e = ceiling; }
  if (s < floor) { e += floor - s; s = floor; }
  return [Math.max(floor, s), Math.min(ceiling, e)];
}

/**
 * Owns the history chart's visible state: a chart WINDOW ("box", from/to -
 * what TimeSeriesChart plots) nested inside a seek-bar STRIP (stripFrom/
 * stripTo - what TimelineBrush's track spans). A named preset sets the
 * strip's span exactly and right-edge-anchors it; the box defaults to a
 * sixth of that (defaultBoxWidthMs), also right-anchored. Dragging/resizing
 * the box within the strip (brushChange) only ever touches the box - the
 * strip, and therefore rangeKey, is untouched, since the preset still
 * truthfully describes the strip. Only a chart drag-select breaks the
 * preset: it sets the box to the exact selection and re-derives a strip
 * around it, going 'custom'. A live tick slides both box and strip by the
 * same delta while following, keeping both widths.
 */
export function viewportReducer(state: ViewportState, action: ViewportAction): ViewportState {
  switch (action.type) {
    case 'init':
      return initViewport(action.now);
    case 'setRange': {
      const stripWidth = windowMsForRangeKey(action.key) ?? (state.stripTo - state.stripFrom);
      const boxWidth = defaultBoxWidthMs(stripWidth);
      return {
        from: action.now - boxWidth, to: action.now,
        stripFrom: action.now - stripWidth, stripTo: action.now,
        rangeKey: action.key, lastPresetKey: action.key, following: true,
      };
    }
    case 'brushChange': {
      // A detached strip only slides on a live 'tick' (following===true), so
      // it's frozen at whatever stripTo was when the user detached - as real
      // time keeps advancing, `action.now` grows past that frozen edge and
      // `to >= action.now` can never trigger again, even after the user
      // drags/resizes/keys the box back to what TimelineBrush's own
      // SNAP_PX visually presents as "the live edge" (stripTo). Treat that
      // as reattach intent instead: re-anchor the whole viewport to now.
      if (action.to >= state.stripTo) {
        const boxWidth = action.to - action.from;
        const stripWidth = state.stripTo - state.stripFrom;
        return {
          ...state,
          from: action.now - boxWidth, to: action.now,
          stripFrom: action.now - stripWidth, stripTo: action.now,
          following: true,
        };
      }
      const following = action.to >= action.now;
      const to = following ? action.now : action.to;
      return { ...state, from: action.from, to, following };
    }
    case 'chartDragSelect': {
      const rawFrom = Math.min(action.from, action.to);
      const rawTo = Math.max(action.from, action.to);
      // Floored the same as a TimelineBrush drag (MIN_BOX_WINDOW_MS), so a
      // few-pixel drag on even the narrowest default box (the 30m preset's
      // own 5-minute box) can't produce a near-empty, practically
      // un-scrubbable selection; grown forward from the selection's start
      // and then pulled back under the live edge if that overshoots.
      const boxWidth = Math.max(MIN_BOX_WINDOW_MS, rawTo - rawFrom);
      let boxFrom = rawFrom;
      let boxTo = boxFrom + boxWidth;
      if (boxTo > action.now) { boxTo = action.now; boxFrom = boxTo - boxWidth; }
      const stripWidth = Math.min(action.retentionMs, boxWidth * STRIP_TO_BOX_RATIO);
      const center = (boxFrom + boxTo) / 2;
      const [stripFrom, stripTo] = clampSpanShift(
        center - stripWidth / 2, center + stripWidth / 2,
        action.now - action.retentionMs, action.now,
      );
      return {
        from: boxFrom, to: boxTo,
        stripFrom, stripTo,
        rangeKey: 'custom', lastPresetKey: state.lastPresetKey,
        following: boxTo >= action.now,
      };
    }
    case 'tick': {
      if (!state.following) return state;
      const boxWidth = state.to - state.from;
      const stripWidth = state.stripTo - state.stripFrom;
      return {
        ...state,
        from: action.now - boxWidth, to: action.now,
        stripFrom: action.now - stripWidth, stripTo: action.now,
      };
    }
    case 'retentionClamp': {
      const floor = action.now - action.retentionMs;
      if (state.stripFrom >= floor) return state;
      // A detached box can sit entirely below floor (its `to` as well as its
      // `from`) - clamping `from` alone while leaving `to` untouched would
      // then invert the domain. clampSpanShift moves the whole box up to
      // the floor, preserving its width. `ceiling` guards the (pathological)
      // case where the strip's own `stripTo` already sits below floor, which
      // would otherwise hand clampSpanShift a ceiling under its floor.
      const ceiling = Math.max(state.stripTo, floor);
      const [boxFrom, boxTo] = clampSpanShift(state.from, state.to, floor, ceiling);
      return {
        ...state,
        stripFrom: floor,
        from: boxFrom,
        to: boxTo,
        rangeKey: rangeKeyForWindow(ceiling - floor),
      };
    }
    case 'backToLive': {
      const boxWidth = state.to - state.from;
      const stripWidth = state.stripTo - state.stripFrom;
      return {
        ...state,
        from: action.now - boxWidth, to: action.now,
        stripFrom: action.now - stripWidth, stripTo: action.now,
        following: true,
      };
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

// TempRibbon's absolute thickness scale (item 31): near-zero thickness at
// the floor, full thickness at the per-kind cap - a fixed real-world range
// instead of the window's own min/max, so the ribbon reads the same way
// across different scrub windows. Clamped in TempRibbon itself.
export const TEMP_RIBBON_FLOOR_C = 30;
export const CPU_TEMP_RIBBON_CAP_C = 100;
export const GPU_TEMP_RIBBON_CAP_C = 95;

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

const BRUSH_LABEL_TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const BRUSH_LABEL_DAY_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...BRUSH_LABEL_TIME_OPTS };

/**
 * The seek-bar block's two docked edge labels (start/end). Time-only when
 * both edges fall on the same calendar day; a short localized day is
 * prefixed on both when they don't (a strip spanning midnight would
 * otherwise show two same-looking times with no way to tell them apart).
 */
export function formatBrushEdgeLabels(startMs: number, endMs: number, locale?: string): [string, string] {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  const opts = sameDay ? BRUSH_LABEL_TIME_OPTS : BRUSH_LABEL_DAY_OPTS;
  return [start.toLocaleString(locale, opts), end.toLocaleString(locale, opts)];
}
