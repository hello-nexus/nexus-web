// Pure geometry for TimelineBrush, kept side-effect-free (no React, no DOM)
// so it's covered directly by timelineBrushUtils.test.ts instead of through
// pointer-event simulation.

import { GAP_MULTIPLIER, medianSpacingOfPoints, splitIntoSegments } from '../TimeSeriesChart/timeSeriesChartUtils';

// The smallest a dragged window (or a preset-derived default box) may be -
// shared between TimelineBrush's own drag clamping and the viewport
// reducer's default-box derivation so both agree on the same floor.
export const MIN_BOX_WINDOW_MS = 60_000;

export function msToPx(t: number, domainStart: number, domainEnd: number, width: number): number {
  const span = domainEnd - domainStart || 1;
  return ((t - domainStart) / span) * width;
}

export function pxToMs(x: number, domainStart: number, domainEnd: number, width: number): number {
  const span = domainEnd - domainStart || 1;
  return domainStart + (x / (width || 1)) * span;
}

export type BrushHitZone = 'left-edge' | 'right-edge' | 'box' | 'track';

/** Which part of the brush a pointer at `x` (track-local px) landed on. Edge
 *  zones win over the box so a narrow window's edges stay grabbable. */
export function hitZoneAt(x: number, fromPx: number, toPx: number, edgeTolerancePx: number): BrushHitZone {
  if (Math.abs(x - fromPx) <= edgeTolerancePx) return 'left-edge';
  if (Math.abs(x - toPx) <= edgeTolerancePx) return 'right-edge';
  if (x > fromPx && x < toPx) return 'box';
  return 'track';
}

/** Clamps a [from, to] window to the domain, growing it to minWindowMs first
 *  (preferring to extend the right edge) when it's narrower than that. */
export function clampWindow(
  from: number, to: number, domainStart: number, domainEnd: number, minWindowMs: number,
): [number, number] {
  let f = from;
  let t = to;
  if (t - f < minWindowMs) t = f + minWindowMs;
  if (f < domainStart) {
    const width = t - f;
    f = domainStart;
    t = f + width;
  }
  if (t > domainEnd) {
    const width = t - f;
    t = domainEnd;
    f = Math.max(domainStart, t - width);
  }
  return [f, t];
}

/** Shifts the whole window by deltaMs, clamped so neither edge escapes the domain. */
export function panWindow(
  from: number, to: number, deltaMs: number, domainStart: number, domainEnd: number,
): [number, number] {
  const width = to - from;
  let f = from + deltaMs;
  let t = to + deltaMs;
  if (f < domainStart) { f = domainStart; t = f + width; }
  if (t > domainEnd) { t = domainEnd; f = t - width; }
  return [f, t];
}

/** New `from` for a left-edge drag: clamped to the domain start and to keep
 *  at least minWindowMs before `to`. */
export function resizeLeftEdge(to: number, candidateFrom: number, domainStart: number, minWindowMs: number): number {
  return Math.min(Math.max(candidateFrom, domainStart), to - minWindowMs);
}

/** New `to` for a right-edge drag: clamped to the domain end and to keep at
 *  least minWindowMs after `from`. */
export function resizeRightEdge(from: number, candidateTo: number, domainEnd: number, minWindowMs: number): number {
  return Math.max(Math.min(candidateTo, domainEnd), from + minWindowMs);
}

/** Snaps a px position to domainEndPx once within tolerancePx, so a
 *  right-edge drag can land exactly on the live edge and reattach following. */
export function snapToEnd(px: number, domainEndPx: number, tolerancePx: number): number {
  return Math.abs(px - domainEndPx) <= tolerancePx ? domainEndPx : px;
}

export interface SilhouetteValuePoint {
  t: number;
  v: number;
}

// Half-width (px) of the sliver drawn for a data point isolated between two
// gaps on both sides - a single point has no line to fill under, so it gets
// a thin bar instead of vanishing.
const ISOLATED_POINT_HALF_WIDTH_PX = 0.75;

/**
 * SVG path `d` for the seek-bar's plain fill silhouette: one closed subpath
 * per contiguous run of points (no gap wider than GAP_MULTIPLIER times the
 * series' own median spacing - the same rule TimeSeriesChart's line chart
 * uses), each subpath dropping straight to `baselineY` at its own edges.
 * A missing stretch therefore falls between two subpaths and renders as
 * background (zero fill), never a diagonal line lerped across the gap - and
 * the same holds before the first / after the last point, since those edges
 * drop to baseline immediately rather than ramping from the domain edge.
 * Returns null when there is nothing to draw.
 */
export function buildSilhouettePathD(
  points: readonly SilhouetteValuePoint[],
  tPx: (t: number) => number,
  vY: (v: number) => number,
  baselineY: number,
): string | null {
  if (points.length === 0) return null;
  const maxGapMs = (medianSpacingOfPoints(points) ?? Infinity) * GAP_MULTIPLIER;
  const asChartPoints = points.map(p => ({ t: p.t, avg: p.v, max: p.v }));
  const segments = splitIntoSegments(asChartPoints, maxGapMs);

  const subpaths = segments.map(segment => {
    if (segment.length === 1) {
      const x = tPx(segment[0].t);
      const y = vY(segment[0].avg).toFixed(1);
      const left = (x - ISOLATED_POINT_HALF_WIDTH_PX).toFixed(1);
      const right = (x + ISOLATED_POINT_HALF_WIDTH_PX).toFixed(1);
      return `M${left},${baselineY.toFixed(1)} L${left},${y} L${right},${y} L${right},${baselineY.toFixed(1)} Z`;
    }
    const pts = segment.map(p => `${tPx(p.t).toFixed(1)},${vY(p.avg).toFixed(1)}`);
    const x0 = tPx(segment[0].t).toFixed(1);
    const xN = tPx(segment[segment.length - 1].t).toFixed(1);
    return `M${x0},${baselineY.toFixed(1)} L${pts.join(' L')} L${xN},${baselineY.toFixed(1)} Z`;
  });
  return subpaths.join(' ');
}
