// Pure geometry for TimelineBrush, kept side-effect-free (no React, no DOM)
// so it's covered directly by timelineBrushUtils.test.ts instead of through
// pointer-event simulation.

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
