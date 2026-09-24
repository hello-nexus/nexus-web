// Pure gesture geometry for `ui-manipulable` children of a `ui-layer`: the
// transform a drag, pinch or twist settles on. No DOM, so it is unit testable.

export interface Point { x: number; y: number }
/** Centre `x`/`y` as 0..1 of the layer box, `scale` multiplier, `rotation` in degrees. */
export interface Transform { x: number; y: number; scale: number; rotation: number }

/** Fraction of the layer's shorter side one unscaled manipulable spans. */
export const DEFAULT_SIZE_FRACTION = 0.24;
export const DEFAULT_MIN_SCALE = 0.35;
export const DEFAULT_MAX_SCALE = 3;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function normalizeDeg(r: number): number {
  const m = r % 360;
  return m > 180 ? m - 360 : m <= -180 ? m + 360 : m;
}

/** Coerces the worker's transform props; anything missing or non-finite
 *  falls back to the centred rest pose. */
export function readTransform(p: { x?: unknown; y?: unknown; scale?: unknown; rotation?: unknown }, minScale: number, maxScale: number): Transform {
  return {
    x: finite(p.x) ? clamp(p.x, 0, 1) : 0.5,
    y: finite(p.y) ? clamp(p.y, 0, 1) : 0.5,
    scale: finite(p.scale) ? clamp(p.scale, minScale, maxScale) : 1,
    rotation: finite(p.rotation) ? normalizeDeg(p.rotation) : 0,
  };
}

export function basePx(layerWidth: number, layerHeight: number, sizeFraction: number): number {
  return Math.max(24, Math.round(Math.min(layerWidth, layerHeight) * sizeFraction));
}

/** Gesture start snapshot: the transform plus the finger(s) that grabbed it. */
export interface GestureStart { transform: Transform; a: Point; b?: Point }

/**
 * The transform a gesture has dragged/pinched/twisted to. One finger
 * translates; two fingers scale by the change in their distance, rotate by
 * the change in their angle, and translate by the drift of their midpoint,
 * all relative to where the gesture started so nothing jumps on the first
 * move. Coordinates are layer pixels; `w`/`h` is the layer box.
 */
export function applyGesture(start: GestureStart, a: Point, b: Point | undefined, w: number, h: number, minScale: number, maxScale: number): Transform {
  const t0 = start.transform;
  if (w <= 0 || h <= 0) return t0;
  if (!start.b || !b) {
    return { ...t0, x: clamp(t0.x + (a.x - start.a.x) / w, 0, 1), y: clamp(t0.y + (a.y - start.a.y) / h, 0, 1) };
  }
  const d0 = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  const d1 = Math.hypot(b.x - a.x, b.y - a.y);
  const ang0 = Math.atan2(start.b.y - start.a.y, start.b.x - start.a.x);
  const ang1 = Math.atan2(b.y - a.y, b.x - a.x);
  const mid0 = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    x: clamp(t0.x + (mid1.x - mid0.x) / w, 0, 1),
    y: clamp(t0.y + (mid1.y - mid0.y) / h, 0, 1),
    scale: d0 > 0 ? clamp(t0.scale * (d1 / d0), minScale, maxScale) : t0.scale,
    rotation: normalizeDeg(t0.rotation + ((ang1 - ang0) * 180) / Math.PI),
  };
}
