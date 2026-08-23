// Pure view-transform + gesture math. Kept free of DOM and React so the pinch
// and fit-to-content behaviour is unit-testable without a canvas.

import { MAX_SCALE, MIN_SCALE, type Point, type Stroke, type ViewTransform } from './whiteboardTypes';

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Viewport pixel -> canvas plane. The inverse of `canvasToScreen`. */
export function screenToCanvas(p: Point, view: ViewTransform): Point {
  return {
    x: (p.x - view.panX) / view.scale,
    y: (p.y - view.panY) / view.scale,
  };
}

/** Canvas plane -> viewport pixel. */
export function canvasToScreen(p: Point, view: ViewTransform): Point {
  return {
    x: p.x * view.scale + view.panX,
    y: p.y * view.scale + view.panY,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The view that results from a pinch, holding `anchor` (the viewport point
 * under the gesture's centre) over the same canvas point throughout. Deriving
 * the whole transform from the gesture's ORIGINAL view rather than accumulating
 * per-move deltas is what keeps a long pinch from drifting.
 */
export function applyPinch(
  start: ViewTransform,
  startAnchor: Point,
  startSpread: number,
  anchor: Point,
  spread: number,
): ViewTransform {
  // A zero starting spread means the two pointers landed on the same pixel;
  // treat the gesture as pure pan rather than dividing by zero.
  const ratio = startSpread > 0 ? spread / startSpread : 1;
  const scale = clampScale(start.scale * ratio);
  // The canvas point the gesture grabbed, resolved once against the start view.
  const held = screenToCanvas(startAnchor, start);
  return {
    scale,
    panX: anchor.x - held.x * scale,
    panY: anchor.y - held.y * scale,
  };
}

/** Wheel / button zoom about a fixed viewport point. */
export function zoomAbout(view: ViewTransform, anchor: Point, factor: number): ViewTransform {
  const scale = clampScale(view.scale * factor);
  const held = screenToCanvas(anchor, view);
  return {
    scale,
    panX: anchor.x - held.x * scale,
    panY: anchor.y - held.y * scale,
  };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Canvas-space bounding box of the ink, widened by each stroke's half-width so
 * a fit never clips the outer edge of a thick line. Null when there is no ink.
 */
export function strokeBounds(strokes: readonly Stroke[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    const pad = stroke.width / 2;
    for (const p of stroke.points) {
      if (p.x - pad < minX) minX = p.x - pad;
      if (p.y - pad < minY) minY = p.y - pad;
      if (p.x + pad > maxX) maxX = p.x + pad;
      if (p.y + pad > maxY) maxY = p.y + pad;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * View that centres all ink in a `width` x `height` viewport with `padding`
 * pixels of margin. Used by the tile thumbnail (which always shows the whole
 * drawing regardless of the saved view) and the fullscreen "fit" control.
 * Returns the identity view centred on the origin when there is no ink.
 */
export function fitView(
  strokes: readonly Stroke[],
  width: number,
  height: number,
  padding = 0,
): ViewTransform {
  const bounds = strokeBounds(strokes);
  if (!bounds || width <= 0 || height <= 0) {
    return { scale: 1, panX: width / 2, panY: height / 2 };
  }
  const inkW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const inkH = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const availW = Math.max(width - padding * 2, 1);
  const availH = Math.max(height - padding * 2, 1);
  // Never zoom a tiny doodle up past 1:1 - a three-pixel dot blown up to fill
  // a 4x4 tile reads as a rendering fault, not as content.
  const scale = clampScale(Math.min(availW / inkW, availH / inkH, 1));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    panX: width / 2 - cx * scale,
    panY: height / 2 - cy * scale,
  };
}
