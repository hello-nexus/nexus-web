import type { CurvePoint } from '../api/cooling';

/** How a curve travels between its points. `linear` is the cooling engine's
 *  piecewise-linear rule; `smooth` is a monotone cubic spline
 *  (Fritsch-Carlson) that curves through every point without overshooting. */
export type CurveEasing = 'linear' | 'smooth';

/** The x axis is circular: past `max` the curve continues from `min`, and
 *  the outermost points join across the seam. */
export interface CurveWrap { min: number; max: number }

/**
 * Value of a curve at `x`. Mirrored by nexus-service's `CurveEasing.cs` so a
 * schedule reads the same on the graph and on the LEDs; keep the two in step.
 * Outside the point range a non-wrapping curve holds its end values, as the
 * cooling engine does.
 */
export function interpolateCurve(
  points: CurvePoint[], x: number, easing: CurveEasing = 'linear', wrap?: CurveWrap,
): number {
  const sorted = [...points].sort((a, b) => a.temp - b.temp);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0].speed;
  const xs = sorted.map(p => p.temp);
  const ys = sorted.map(p => p.speed);
  const span = wrap ? wrap.max - wrap.min : 0;
  const wrapping = span > 0;
  let xx = x;
  if (wrapping) {
    xx = wrap!.min + (((x - wrap!.min) % span) + span) % span;
  } else {
    if (xx <= xs[0]) return ys[0];
    if (xx >= xs[n - 1]) return ys[n - 1];
  }
  // Segment i runs from point i to point i+1; on a wrapping axis the last
  // segment runs from the last point back to the first, one span later, and
  // owns both ends of the axis. Right-inclusive, first match, like the cooling
  // engine: two points on one x read as the earlier one.
  let i = n - 1;
  for (let k = 0; k < n - 1; k++) {
    if (xx >= xs[k] && xx <= xs[k + 1]) { i = k; break; }
  }
  if (i === n - 1 && xx < xs[0]) xx += span;
  const next = (i + 1) % n;
  const x0 = xs[i], x1 = xs[next] + (next === 0 ? span : 0);
  const h = x1 - x0;
  if (h <= 0) return ys[i];
  const t = (xx - x0) / h;
  if (easing === 'linear') return ys[i] + (ys[next] - ys[i]) * t;
  const m = tangents(xs, ys, wrapping ? span : 0);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i]
    + (t3 - 2 * t2 + t) * h * m[i]
    + (-2 * t3 + 3 * t2) * ys[next]
    + (t3 - t2) * h * m[next];
}

// Fritsch-Carlson tangents: the average of the neighbouring secants, zero at
// an extremum, then limited so no segment overshoots. `span` > 0 treats the
// points as circular, so every point has two neighbours.
function tangents(xs: number[], ys: number[], span: number): number[] {
  const n = xs.length;
  const wrap = span > 0;
  const segments = wrap ? n : n - 1;
  const d: number[] = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % n;
    const dx = xs[next] - xs[i] + (next === 0 ? span : 0);
    d.push(dx > 0 ? (ys[next] - ys[i]) / dx : 0);
  }
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const hasPrev = wrap || i > 0;
    const hasNext = wrap || i < n - 1;
    if (hasPrev && hasNext) {
      const dp = d[(i - 1 + segments) % segments], dn = d[i % segments];
      m[i] = dp * dn <= 0 ? 0 : (dp + dn) / 2;
    } else {
      m[i] = hasNext ? d[i] : d[i - 1];
    }
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % n;
    if (d[i] === 0) { m[i] = 0; m[next] = 0; continue; }
    const a = m[i] / d[i], b = m[next] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[next] = tau * b * d[i];
    }
  }
  return m;
}
