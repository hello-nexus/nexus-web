// Flat ribbon (a cable with a rectangular cross-section) swept along a polyline, in scene mm.

export type RibbonVec3 = [number, number, number];

export interface RibbonData {
  /** Vertex xyz triples, four per ring (corner order: +w+n, -w+n, -w-n, +w-n). */
  positions: number[];
  /** Triangle indices into the vertices. */
  indices: number[];
  /** The four long edges, one polyline each. */
  edges: RibbonVec3[][];
}

const sub = (a: RibbonVec3, b: RibbonVec3): RibbonVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: RibbonVec3, b: RibbonVec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: RibbonVec3, b: RibbonVec3): RibbonVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: RibbonVec3): RibbonVec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

const DUPLICATE = 1e-6;
const nextApart = (pts: RibbonVec3[], i: number) => {
  let k = i + 1;
  while (k < pts.length - 1 && Math.hypot(...sub(pts[k], pts[i])) < DUPLICATE) k++;
  return Math.min(k, pts.length - 1);
};
const prevApart = (pts: RibbonVec3[], i: number) => {
  let k = i - 1;
  while (k > 0 && Math.hypot(...sub(pts[k], pts[i])) < DUPLICATE) k--;
  return Math.max(k, 0);
};

/**
 * Tangent at each sample: the chord between its neighbors. `across[i]` is the width direction at sample i; it is
 * made perpendicular to the tangent, so a sample whose width direction runs along the path still gets a frame.
 */
export function ribbonData(points: RibbonVec3[], across: RibbonVec3[], width: number, thickness: number): RibbonData {
  const positions: number[] = [];
  const indices: number[] = [];
  const edges: RibbonVec3[][] = [[], [], [], []];
  const n = points.length;
  if (n < 2) return { positions, indices, edges };
  const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < n; i++) {
    const t = unit(sub(points[nextApart(points, i)], points[prevApart(points, i)]));
    const a = across[Math.min(i, across.length - 1)];
    const flat = sub(a, [t[0] * dot(a, t), t[1] * dot(a, t), t[2] * dot(a, t)]);
    const w = Math.hypot(...flat) > 1e-6 ? unit(flat) : unit(cross(t, Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const nn = unit(cross(t, w));
    corners.forEach(([sw, sn], c) => {
      const p: RibbonVec3 = [
        points[i][0] + (w[0] * sw * width) / 2 + (nn[0] * sn * thickness) / 2,
        points[i][1] + (w[1] * sw * width) / 2 + (nn[1] * sn * thickness) / 2,
        points[i][2] + (w[2] * sw * width) / 2 + (nn[2] * sn * thickness) / 2,
      ];
      positions.push(...p);
      edges[c].push(p);
    });
  }
  for (let i = 0; i < n - 1; i++) {
    for (let c = 0; c < 4; c++) {
      const a = i * 4 + c;
      const b = i * 4 + ((c + 1) % 4);
      indices.push(a, b, a + 4, b, b + 4, a + 4);
    }
  }
  for (const base of [0, (n - 1) * 4]) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return { positions, indices, edges };
}
