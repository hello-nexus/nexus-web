import type { CaseBox, CaseChamfer, Vec3 } from '../caseLayout';

/** Layout-mm test of a part's own shape, the one Build draws: plate, closed solid, loft, chamfered box or plain box, turned by `rotationY` about its centre. */

function pointInPolygon(poly: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const FACETS_BY_RADIUS: [number, number][] = [[12, 1], [40, 2], [90, 3]];

function facetCount(radius: number): number {
  for (const [limit, count] of FACETS_BY_RADIUS) if (radius < limit) return count;
  return 4;
}

/** Whether `p` (box-local, 0..size on each axis) survives every chamfer cut, as chamferedGeometry draws them. */
function keptByChamfers(p: Vec3, size: Vec3, chamfers: readonly CaseChamfer[]): boolean {
  for (const c of chamfers) {
    const da = c.aMax ? size[c.a] - p[c.a] : p[c.a];
    const db = c.bMax ? size[c.b] - p[c.b] : p[c.b];
    if (!c.round) {
      if (da / c.legB + db / c.legA < 1) return false;
      continue;
    }
    const facets = facetCount(Math.max(c.legA, c.legB));
    for (let i = 0; i < facets; i++) {
      const phi = ((i + 0.5) * Math.PI) / 2 / facets;
      const wa = Math.cos(phi);
      const wb = Math.sin(phi);
      if ((wa * da) / c.legB + (wb * db) / c.legA < wa + wb - 1) return false;
    }
  }
  return true;
}

interface FacePlane {
  pts: Vec3[];
  normal: Vec3;
  d: number;
  drop: 0 | 1 | 2;
}

const planeCache = new WeakMap<object, FacePlane[]>();

function planesOf(faces: Vec3[][]): FacePlane[] {
  const cached = planeCache.get(faces);
  if (cached) return cached;
  const out: FacePlane[] = [];
  for (const pts of faces) {
    const n: Vec3 = [0, 0, 0];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const a = n.map(Math.abs);
    const drop = (a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2) as 0 | 1 | 2;
    if (a[drop] < 1e-9) continue;
    out.push({ pts, normal: n, d: n[0] * pts[0][0] + n[1] * pts[0][1] + n[2] * pts[0][2], drop });
  }
  planeCache.set(faces, out);
  return out;
}

/** Even-odd count of face crossings along +x, with the ray nudged off shared edges. */
function insideSolid(faces: Vec3[][], x: number, y: number, z: number): boolean {
  const oy = y + 0.00137;
  const oz = z + 0.00291;
  let hits = 0;
  for (const f of planesOf(faces)) {
    if (Math.abs(f.normal[0]) < 1e-12) continue;
    const t = (f.d - f.normal[1] * oy - f.normal[2] * oz) / f.normal[0];
    if (t <= x) continue;
    const q: Vec3 = [t, oy, oz];
    const [u, v] = f.drop === 0 ? [1, 2] : f.drop === 1 ? [2, 0] : [0, 1];
    const poly = f.pts.map(p => [p[u], p[v]] as [number, number]);
    if (pointInPolygon(poly, q[u], q[v])) hits++;
  }
  return hits % 2 === 1;
}

/** Test point `p` against `box`'s shape. Parts thinner than `minThickness` on an axis count as that thick, so a one-cell grid still sees them. */
export function boxContains(box: CaseBox, p: Vec3, minThickness: number): boolean {
  const cx = box.min[0] + box.size[0] / 2;
  const cy = box.min[1] + box.size[1] / 2;
  const cz = box.min[2] + box.size[2] / 2;
  const th = box.rotationY ?? 0;
  const dx = p[0] - cx;
  const dz = p[2] - cz;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  // Inverse of rotation.y = th: three turns +x toward -z.
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ly = p[1] - cy;
  const half: Vec3 = [Math.max(box.size[0], minThickness) / 2, Math.max(box.size[1], minThickness) / 2, Math.max(box.size[2], minThickness) / 2];
  if (Math.abs(lx) > half[0] || Math.abs(ly) > half[1] || Math.abs(lz) > half[2]) return false;
  const q: Vec3 = [cx + lx, cy + ly, cz + lz];

  if (box.plate) {
    const n = box.plate.normal;
    const [a, b] = [0, 1, 2].filter(i => i !== n);
    if (!pointInPolygon(box.plate.outline, q[a], q[b])) return false;
    return !box.plate.holes.some(h => pointInPolygon(h, q[a], q[b]));
  }
  if (box.faces) return insideSolid(box.faces, q[0], q[1], q[2]);
  if (box.rings) {
    const rings = box.rings;
    const y0 = rings[0].y;
    const y1 = rings[rings.length - 1].y;
    if (q[1] < Math.min(y0, y1) || q[1] > Math.max(y0, y1)) return false;
    let r = 0;
    while (r < rings.length - 2 && q[1] > rings[r + 1].y) r++;
    const span = rings[r + 1].y - rings[r].y;
    const f = span === 0 ? 0 : Math.min(1, Math.max(0, (q[1] - rings[r].y) / span));
    const poly = rings[r].pts.map(([x, z], i) => [x + (rings[r + 1].pts[i][0] - x) * f, z + (rings[r + 1].pts[i][1] - z) * f] as [number, number]);
    return pointInPolygon(poly, q[0], q[2]);
  }
  if (box.chamfers) {
    return keptByChamfers([lx + box.size[0] / 2, ly + box.size[1] / 2, lz + box.size[2] / 2], box.size, box.chamfers);
  }
  return true;
}

/** Axis-aligned layout-mm bounds of a (possibly turned) box, widened by `pad`; shaped parts lie within their box. */
export function boxBounds(box: CaseBox, pad: number): { min: Vec3; max: Vec3 } {
  const th = box.rotationY ?? 0;
  const cx = box.min[0] + box.size[0] / 2;
  const cy = box.min[1] + box.size[1] / 2;
  const cz = box.min[2] + box.size[2] / 2;
  const hx = box.size[0] / 2;
  const hz = box.size[2] / 2;
  const ex = Math.abs(hx * Math.cos(th)) + Math.abs(hz * Math.sin(th));
  const ez = Math.abs(hx * Math.sin(th)) + Math.abs(hz * Math.cos(th));
  const ey = box.size[1] / 2;
  return { min: [cx - ex - pad, cy - ey - pad, cz - ez - pad], max: [cx + ex + pad, cy + ey + pad, cz + ez + pad] };
}
