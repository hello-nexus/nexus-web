// Pure helpers for ProcessDetailSlideout, kept side-effect-free (no React,
// no i18n) so they're covered directly by processDetailHelpers.test.ts
// instead of through component rendering. Mirrors appWindowHelpers.ts and
// privacyHelpers.ts's approach for the rest of this domain.
import {
  GAP_MULTIPLIER, medianSpacingOfPoints, splitIntoSegments, type TimeSeriesPoint,
} from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import type { AppWindowPoint } from '../../../../api/monitoringHistoryApps';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';
import { matchSessionApp } from './privacyHelpers';
import type { SeriesEntry } from '../../../../hooks/useProcessMonitor';

/** Shortens a long string to `maxChars` by dropping the middle, keeping the
 *  start (usually a drive/root) and the end (usually the filename) visible -
 *  the two ends that matter for recognizing a path at a glance. Returns the
 *  input unchanged when it already fits. */
export function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars || maxChars <= 1) return value;
  const ellipsis = '…';
  const keep = maxChars - ellipsis.length;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${value.slice(0, head)}${ellipsis}${tail > 0 ? value.slice(value.length - tail) : ''}`;
}

/** This process's own privacy-access sessions (webcam/mic/location/screen),
 *  newest-first - unlike privacyHelpers.privacyIndicatorsForProcess (which
 *  additionally drops anything older than its RECENT_WINDOW_MS icon cutoff),
 *  every session the caller already fetched is shown here since the fetch
 *  window itself (useMonitoringPrivacy) is the only recency bound the
 *  detail view needs. */
export function sessionsForProcess(sessions: readonly PrivacySession[], processName: string): PrivacySession[] {
  return sessions
    .filter(s => matchSessionApp(s.app, processName))
    .sort((a, b) => (b.end ?? Infinity) - (a.end ?? Infinity) || b.start - a.start);
}

export interface ProcessLiveUsage {
  cpuPercent?: number;
  memoryMb?: number;
  gpuPercent?: number;
  vramMb?: number;
}

/** Merges the page's independently-polled per-process series (CPU, memory,
 *  GPU load, GPU VRAM) into one name-keyed lookup for the slideout's live
 *  usage tiles - each series may know a different subset of running
 *  processes (e.g. a process using no GPU never appears in the GPU series),
 *  so entries are merged rather than requiring every series to agree on the
 *  same process set. */
export function buildLiveUsageByName(
  cpuSeries: readonly SeriesEntry[],
  memSeries: readonly SeriesEntry[],
  gpuSeries: readonly SeriesEntry[],
  gpuMemSeries: readonly SeriesEntry[],
): Map<string, ProcessLiveUsage> {
  const byName = new Map<string, ProcessLiveUsage>();
  const upsert = (name: string, patch: ProcessLiveUsage) => {
    byName.set(name, { ...byName.get(name), ...patch });
  };
  for (const s of cpuSeries) upsert(s.name, { cpuPercent: s.current });
  for (const s of memSeries) upsert(s.name, { memoryMb: s.current });
  for (const s of gpuSeries) upsert(s.name, { gpuPercent: s.current });
  for (const s of gpuMemSeries) upsert(s.name, { vramMb: s.current });
  return byName;
}

export interface MiniChartSegment {
  /** Stroke-only line path for this gap-free run of points. */
  linePath: string;
  /** Same run, closed down to the baseline, for the area fill. */
  fillPath: string;
}

export interface MiniChartResult {
  segments: MiniChartSegment[];
  hasData: boolean;
}

// Linear scan, not appWindowHelpers' binary search - importing that module
// here would cycle back through ProcessListSection -> ProcessDetailSlideout,
// and these window series (one process, one metric) are small enough that
// the scan cost is negligible. Not timeSeriesChartUtils' nearestPoint either
// - that one requires a maxDeltaMs cap (no established value for a single
// process/metric tile) and a TimeSeriesPoint `max` field AppWindowPoint
// doesn't carry, matching appWindowHelpers' own uncapped nearestAppValueAt
// instead (the same "just find nearest, no cap" contract this mirrors).
function nearestPointIndex(points: readonly AppWindowPoint[], target: number): number {
  if (points.length === 0) return -1;
  let best = 0;
  let bestDelta = Math.abs(points[0].t - target);
  for (let i = 1; i < points.length; i++) {
    const delta = Math.abs(points[i].t - target);
    if (delta < bestDelta) { best = i; bestDelta = delta; }
  }
  return best;
}

/**
 * A usage tile's value at the selected frame: the nearest point in this
 * metric's own fetched window series, falling back to `liveValue` when the
 * series has no points at all (e.g. a process that just launched, before its
 * first historical sample lands). `??` (not `||`) so a legitimate 0 window
 * value is kept rather than overridden by the live fallback.
 */
export function resolveTileValue(
  points: readonly AppWindowPoint[] | undefined,
  selectedFrameMs: number,
  liveValue: number | undefined,
): number | undefined {
  const i = points ? nearestPointIndex(points, selectedFrameMs) : -1;
  return i >= 0 ? points![i].avg : liveValue;
}

/**
 * Builds gap-aware SVG path segments for the process-detail mini chart from
 * a window-scoped apps series (AppWindowPoint[]). X maps linearly across the
 * points' own time span (not sample index, so a run's width reflects its
 * real duration); Y maps [0, max(avg)] to [height, 0] - usage values are
 * never negative, so the floor is always pinned at zero rather than
 * auto-scaled to the data's own minimum. Gaps wider than the data's own
 * median spacing (GAP_MULTIPLIER, shared with TimeSeriesChart/TimelineBrush)
 * break the line instead of interpolating across missing samples.
 */
export function buildMiniChart(points: readonly AppWindowPoint[], width: number, height: number): MiniChartResult {
  if (points.length < 2) return { segments: [], hasData: false };

  const asTimeSeriesPoints: TimeSeriesPoint[] = points.map(p => ({ t: p.t, avg: p.avg, max: p.avg }));
  const spacing = medianSpacingOfPoints(points);
  const maxGapMs = spacing !== null ? spacing * GAP_MULTIPLIER : Infinity;
  const runs = splitIntoSegments(asTimeSeriesPoints, maxGapMs).filter(run => run.length >= 2);

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const spanT = Math.max(1, maxT - minT);
  const maxVal = Math.max(0, ...points.map(p => p.avg)) || 1;

  const x = (t: number) => ((t - minT) / spanT) * width;
  const y = (v: number) => height - (Math.max(0, Math.min(maxVal, v)) / maxVal) * height;

  const segments: MiniChartSegment[] = runs.map(run => {
    const linePath = run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)},${y(p.avg).toFixed(2)}`).join(' ');
    const firstX = x(run[0].t).toFixed(2);
    const lastX = x(run[run.length - 1].t).toFixed(2);
    const fillPath = `${linePath} L${lastX},${height} L${firstX},${height} Z`;
    return { linePath, fillPath };
  });

  return { segments, hasData: segments.length > 0 };
}
