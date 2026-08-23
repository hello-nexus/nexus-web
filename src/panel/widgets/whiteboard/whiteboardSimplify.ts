// Point-count control. A 60 Hz pointer stream produces far more points than a
// stroke's shape needs, and every one of them is persisted and re-rendered -
// so capture drops near-duplicates live, and commit runs a shape-preserving
// simplify over the finished stroke.

import { distance } from './whiteboardGeometry';
import type { Point } from './whiteboardTypes';

/**
 * Whether `candidate` is far enough from the last captured point to be worth
 * keeping. `minGap` is in canvas units, so at high zoom the threshold shrinks
 * in screen terms and fine detail still survives.
 */
export function shouldCapture(last: Point | undefined, candidate: Point, minGap: number): boolean {
  if (!last) return true;
  return distance(last, candidate) >= minGap;
}

/** Perpendicular distance from `p` to the segment ab (degenerate ab -> point distance). */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Ramer-Douglas-Peucker. Iterative rather than recursive: a long stroke can run
 * to thousands of points and a recursive implementation blows the stack on the
 * pathological (already-straight) case.
 */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last - first < 2) continue;

    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

/** Storage is JSON text, so trailing float noise costs bytes for invisible precision. */
export function quantize(points: readonly Point[]): Point[] {
  return points.map(p => ({
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
  }));
}
