import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  EdgesGeometry,
  EllipseCurve,
  Float32BufferAttribute,
  GridHelper,
  Group,
  LessEqualDepth,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Chamfer, FanRing, LayoutShape, ShapeBox, Vec3 } from './sceneTypes';

export interface Palette {
  part: Color;
  frame: Color;
  bad: Color;
  limit: Color;
}

// The canvas 2D context normalizes any CSS color syntax to hex/rgba, which three.js parses.
function cssColor(el: Element, name: string, fallback: string): Color {
  const ctx = document.createElement('canvas').getContext('2d');
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx) return new Color(fallback);
  ctx.fillStyle = fallback;
  if (raw) ctx.fillStyle = raw;
  // Line opacity is set per material; drop the token's own alpha.
  return new Color(String(ctx.fillStyle).replace(/^rgba\((.*),[^,]*\)$/, 'rgb($1)'));
}

/** The wireframe's colors from the theme tokens in effect on an element. */
export function readPalette(el: Element): Palette {
  return {
    part: cssColor(el, '--accent', '#3b82f6'),
    frame: cssColor(el, '--text-dim', '#888888'),
    bad: cssColor(el, '--bad', '#ef4444'),
    limit: cssColor(el, '--warn', '#f59e0b'),
  };
}

interface Style {
  color: Color;
  width: number;
  opacity: number;
  dashed: boolean;
  face: number;
}

// Materials whose opacity follows the highlight, with their un-highlighted opacities.
export interface Dimmable {
  id: string;
  materials: Material[];
  base: number[];
  // Drawn only while its part is highlighted (a case limit, shown with the GPU, PSU or cooler it bounds).
  node?: Group;
}

/** Where buildShape reports what it made: fat-line materials (they need the viewport size), pickable faces, dimmables. */
export interface ShapeSink {
  materials: LineMaterial[];
  pickables: Mesh[];
  dimmables: Dimmable[];
}

const DIMMED = 0.22;

function styleFor(box: ShapeBox, palette: Palette): Style {
  const dashed = box.source === 'estimate';
  if (box.conflict) return { color: palette.bad, width: 2, opacity: 1, dashed, face: 0.1 };
  switch (box.role) {
    case 'ghost': return { color: palette.part, width: 1, opacity: 0.5, dashed: true, face: 0.03 };
    case 'limit': return { color: palette.limit, width: 1, opacity: 0.85, dashed: true, face: 0.05 };
    case 'part': return { color: palette.part, width: 1.6, opacity: 1, dashed, face: 0.07 };
    case 'detail': return { color: palette.part, width: 1, opacity: 0.45, dashed: false, face: 0.04 };
    case 'glass': return { color: palette.frame, width: 1, opacity: 0.35, dashed: false, face: 0.035 };
    // A CAD plate gets a faint face so its cutouts read, an outer wall fainter still; the shell stays lines only.
    default: return box.plate || box.cadSolid
      ? box.plate?.wall ? { color: palette.frame, width: 1, opacity: 0.3, dashed, face: 0.025 } : { color: palette.frame, width: 1, opacity: 0.45, dashed, face: 0.05 }
      : { color: palette.frame, width: 1, opacity: 0.55, dashed, face: 0 };
  }
}

export function applyHighlight(dimmables: Dimmable[], highlight: string | null) {
  for (const d of dimmables) {
    const factor = highlight !== null && d.id !== highlight ? DIMMED : 1;
    d.materials.forEach((m, i) => { m.opacity = d.base[i] * factor; });
    if (d.node) d.node.visible = d.id === highlight;
  }
}

// Fat lines draw after the faces (renderOrder) so a part's faces hide the edges behind it.
function lineMaterial(style: Style, materials: LineMaterial[]): LineMaterial {
  const material = new LineMaterial({
    color: style.color,
    linewidth: style.width,
    transparent: true,
    opacity: style.opacity,
    dashed: style.dashed,
    dashSize: 7,
    gapSize: 5,
  });
  materials.push(material);
  return material;
}

// A measured shape: side walls between consecutive outline rings plus capped ends, centred on its box.
function loftGeometry(box: ShapeBox): BufferGeometry {
  const rings = box.rings ?? [];
  const centre = box.min.map((v, i) => v + box.size[i] / 2);
  const n = rings[0].pts.length;
  const positions = rings.flatMap((r) => r.pts.flatMap(([x, z]) => [x - centre[0], r.y - centre[1], z - centre[2]]));
  const index: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < n; j++) {
      const a = r * n + j;
      const b = r * n + ((j + 1) % n);
      index.push(a, b, b + n, a, b + n, a + n);
    }
  }
  const top = (rings.length - 1) * n;
  const capOf = (ring: number) => ShapeUtils.triangulateShape(rings[ring].pts.map(([x, z]) => new Vector2(x, z)), []);
  for (const [a, b, c] of capOf(0)) index.push(a, c, b);
  for (const [a, b, c] of capOf(rings.length - 1)) index.push(top + a, top + b, top + c);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

// A solid's planar faces, each triangulated in the plane of its two widest axes and centred on the box.
function solidGeometry(box: ShapeBox): BufferGeometry {
  const centre = box.min.map((v, i) => v + box.size[i] / 2);
  const positions: number[] = [];
  for (const face of box.faces ?? []) {
    // Newell's normal: its largest component is the axis the face projects along without folding.
    const n = [0, 0, 0];
    face.forEach((p, i) => {
      const q = face[(i + 1) % face.length];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const abs = n.map(Math.abs);
    const drop = abs.indexOf(Math.max(...abs));
    const [a, b] = [0, 1, 2].filter((i) => i !== drop);
    for (const tri of ShapeUtils.triangulateShape(face.map((p) => new Vector2(p[a], p[b])), [])) {
      for (const i of tri) positions.push(face[i][0] - centre[0], face[i][1] - centre[1], face[i][2] - centre[2]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

// The cutouts of a plate that lies on a shell face, as closed loops of segments.
function holeEdges(box: ShapeBox): number[] {
  const plate = box.plate!;
  const [a, b] = [0, 1, 2].filter((i) => i !== plate.normal);
  const centre = box.min.map((v, i) => v + box.size[i] / 2);
  const at = (u: number, v: number) => {
    const q = [0, 0, 0];
    q[a] = u - centre[a];
    q[b] = v - centre[b];
    return q;
  };
  return plate.holes.flatMap((h) => h.flatMap(([u, v], i) => [...at(u, v), ...at(...h[(i + 1) % h.length])]));
}

// A flat plate with its cutouts, triangulated in its plane and centred on its box.
function plateGeometry(box: ShapeBox): BufferGeometry {
  const plate = box.plate!;
  const [a, b] = [0, 1, 2].filter((i) => i !== plate.normal);
  const centre = box.min.map((v, i) => v + box.size[i] / 2);
  const outline = plate.outline.map(([u, v]) => new Vector2(u, v));
  const holes = plate.holes.map((h) => h.map(([u, v]) => new Vector2(u, v)));
  // triangulateShape drops repeated end points from these arrays in place; its indices follow outline, then holes.
  const index = ShapeUtils.triangulateShape(outline, holes).flat();
  const positions = [outline, ...holes].flat().flatMap((p) => {
    const q = [0, 0, 0];
    q[a] = p.x - centre[a];
    q[b] = p.y - centre[b];
    return q;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

// A box with cut edges: the corners of the region inside the six faces and every cut plane, centred on the origin.
function chamferedGeometry(size: Vec3, chamfers: Chamfer[]): ConvexGeometry {
  const planes: { n: Vec3; d: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const n: Vec3 = [0, 0, 0];
    n[i] = -1;
    planes.push({ n, d: 0 });
    const m: Vec3 = [0, 0, 0];
    m[i] = 1;
    planes.push({ n: m, d: size[i] });
  }
  // Inside a cut: wa * (distance from face a) / legB + wb * (distance from face b) / legA >= k.
  const addCut = (c: Chamfer, wa: number, wb: number, k: number) => {
    const n: Vec3 = [0, 0, 0];
    let d = -k;
    n[c.a] = c.aMax ? wa / c.legB : -wa / c.legB;
    if (c.aMax) d += (wa * size[c.a]) / c.legB;
    n[c.b] += c.bMax ? wb / c.legA : -wb / c.legA;
    if (c.bMax) d += (wb * size[c.b]) / c.legA;
    planes.push({ n, d });
  };
  for (const c of chamfers) {
    if (!c.round) {
      addCut(c, 1, 1, 1);
      continue;
    }
    // A curve is drawn as a few flat facets, each tangent to the quarter ellipse with semi-axes legB and legA.
    const radius = Math.max(c.legA, c.legB);
    const facets = radius < 12 ? 1 : radius < 40 ? 2 : radius < 90 ? 3 : 4;
    for (let i = 0; i < facets; i++) {
      const phi = ((i + 0.5) * Math.PI) / 2 / facets;
      addCut(c, Math.cos(phi), Math.sin(phi), Math.cos(phi) + Math.sin(phi) - 1);
    }
  }
  const points: Vector3[] = [];
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const [a, b, c] = [planes[i], planes[j], planes[k]];
    const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const bc = cross(b.n, c.n);
    const det = a.n[0] * bc[0] + a.n[1] * bc[1] + a.n[2] * bc[2];
    if (Math.abs(det) < 1e-9) continue;
    const ca = cross(c.n, a.n);
    const ab = cross(a.n, b.n);
    const p = [0, 1, 2].map((t) => (a.d * bc[t] + b.d * ca[t] + c.d * ab[t]) / det);
    if (planes.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] <= q.d + 1e-6)) {
      points.push(new Vector3(p[0] - size[0] / 2, p[1] - size[1] / 2, p[2] - size[2] / 2));
    }
  }
  return new ConvexGeometry(points);
}

function fanRings(box: ShapeBox, ring: FanRing, material: LineMaterial): Object3D[] {
  const axisIndex = { x: 0, y: 1, z: 2 }[ring.axis];
  const inPlane = [0, 1, 2].filter((i) => i !== axisIndex);
  // Fans line up along the face's longer edge.
  const along = box.size[inPlane[0]] >= box.size[inPlane[1]] ? inPlane[0] : inPlane[1];
  const across = along === inPlane[0] ? inPlane[1] : inPlane[0];
  const r = ring.diameter / 2;
  const out: Object3D[] = [];
  const faces = ring.bothSides ? ['min', 'max'] : [ring.side];
  for (let k = 0; k < ring.count * faces.length; k++) {
    const i = k % ring.count;
    const center = [0, 0, 0];
    center[axisIndex] = box.min[axisIndex] + (faces[Math.floor(k / ring.count)] === 'max' ? box.size[axisIndex] : 0);
    center[along] = box.min[along] + (box.size[along] * (i + 0.5)) / ring.count;
    center[across] = box.min[across] + box.size[across] / 2;
    const spokes = new LineSegmentsGeometry().setPositions(Array.from({ length: 5 }, (_, k) => {
      const a = (k * 2 * Math.PI) / 5;
      return [Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, 0, Math.cos(a + 0.5) * r * 0.92, Math.sin(a + 0.5) * r * 0.92, 0];
    }).flat());
    const blades = new LineSegments2(spokes, material);
    if (ring.axis === 'x') blades.rotation.y = Math.PI / 2;
    if (ring.axis === 'y') blades.rotation.x = Math.PI / 2;
    blades.position.set(center[0], center[1], center[2]);
    blades.renderOrder = 1;
    out.push(blades);
    for (const radius of [r, r * 0.3]) {
      const points = new EllipseCurve(0, 0, radius, radius).getPoints(radius > 20 ? 56 : 24);
      const geometry = new LineGeometry().setPositions(points.flatMap((p) => [p.x, p.y, 0]));
      const loop = new Line2(geometry, material);
      if (ring.axis === 'x') loop.rotation.y = Math.PI / 2;
      if (ring.axis === 'y') loop.rotation.x = Math.PI / 2;
      loop.position.set(center[0], center[1], center[2]);
      loop.renderOrder = 1;
      if (material.dashed) loop.computeLineDistances();
      out.push(loop);
    }
  }
  return out;
}

/** A box's own shape, centred on its box: the plate, solid, loft or chamfered box it carries, else the plain box. */
export function boxShape(box: ShapeBox): BufferGeometry {
  return box.plate ? plateGeometry(box) : box.faces ? solidGeometry(box) : box.rings ? loftGeometry(box) : box.chamfers ? chamferedGeometry(box.size, box.chamfers) : new BoxGeometry(...box.size);
}

/** A shape's parts in its own layout space (corner at the origin); `pickable` limits which faces report to the sink. */
export function buildShape(shape: LayoutShape, palette: Palette, sink: ShapeSink, pickable = true): Group {
  const group = new Group();
  for (const box of shape.boxes) {
    const style = styleFor(box, palette);
    const id = box.select ?? box.slot;
    const dimmable: Dimmable | null = !box.conflict && (box.role === 'part' || box.role === 'detail') ? { id, materials: [], base: [] } : null;
    // Each box is built around its own centre, so a turned box turns in place.
    const node = new Group();
    node.position.set(box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2);
    node.rotation.y = box.rotationY ?? 0;
    const local: ShapeBox = { ...box, min: [-box.size[0] / 2, -box.size[1] / 2, -box.size[2] / 2] };
    const geometry = boxShape(box);
    const solid = box.role === 'part' || box.role === 'detail';
    // A loft's or solid's winding follows its outline's direction and a plate is seen from both sides, so both sides draw.
    const side = box.rings || box.faces || box.plate ? { side: DoubleSide } : {};
    const flat = box.plate || box.cadSolid;
    const offset = { polygonOffset: true, polygonOffsetFactor: flat ? 2 : 1, polygonOffsetUnits: flat ? 2 : 1 };
    if (solid) {
      // Depth only, drawn before every tint: the nearest part surface owns each pixel, so overlapping parts
      // tint once and in no camera-dependent order, and edges behind a part stay hidden.
      node.add(new Mesh(geometry, new MeshBasicMaterial({ colorWrite: false, ...side, ...offset })));
    }
    if (style.face > 0) {
      const face = new Mesh(geometry, new MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: style.face,
        depthWrite: false,
        // Equal passes the part's own prepass depth; a farther part's face fails it. A limit plane always shows:
        // it shares the part's cross-section, so a part over its limit would otherwise hide the red.
        depthFunc: LessEqualDepth,
        depthTest: box.role !== 'limit',
        ...side,
        ...offset,
      }));
      // Walls, then plates, then parts: a fixed blend order instead of the per-frame distance sort.
      face.renderOrder = box.plate?.wall ? -3 : flat ? -2 : 0;
      face.userData.select = id;
      if (pickable && (box.role === 'part' || box.role === 'detail' || box.role === 'ghost')) sink.pickables.push(face);
      dimmable?.materials.push(face.material);
      dimmable?.base.push(style.face);
      node.add(face);
    }
    const material = lineMaterial(style, sink.materials);
    dimmable?.materials.push(material);
    dimmable?.base.push(style.opacity);
    if (dimmable) sink.dimmables.push(dimmable);
    // A threshold angle keeps the triangulated hull's coplanar seams out of the outline.
    const edges = new LineSegments2(box.plate?.onShell ? new LineSegmentsGeometry().setPositions(holeEdges(box)) : new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(geometry, 10)), material);
    edges.renderOrder = 1;
    if (style.dashed) edges.computeLineDistances();
    node.add(edges);
    if (box.fans) node.add(...fanRings(local, box.fans, material));
    if (box.role === 'limit') sink.dimmables.push({ id, materials: [], base: [], node });
    group.add(node);
  }
  for (const line of shape.lines) {
    const detail = line.role === 'detail';
    const opacity = detail ? 0.4 : 0.8;
    const material = lineMaterial({ color: palette.part, width: detail ? 1 : 1.4, opacity, dashed: false, face: 0 }, sink.materials);
    sink.dimmables.push({ id: line.slot, materials: [material], base: [opacity] });
    const points = line.points.length > 2 ? new CatmullRomCurve3(line.points.map((p) => new Vector3(...p))).getPoints(32) : line.points.map((p) => new Vector3(...p));
    const tube = new Line2(new LineGeometry().setPositions(points.flatMap((p) => [p.x, p.y, p.z])), material);
    tube.renderOrder = 1;
    group.add(tube);
  }
  return group;
}

/** A faint floor grid of a given side length, centred on the origin, just under y = 0. */
export function floorGrid(side: number, palette: Palette): GridHelper {
  const grid = new GridHelper(side, Math.max(1, Math.round(side / 50)), palette.frame, palette.frame);
  (grid.material as Material).transparent = true;
  (grid.material as Material).opacity = 0.12;
  grid.position.y = -0.5;
  return grid;
}

export function disposeGroup(group: Object3D) {
  group.traverse((obj) => {
    const withGeometry = obj as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    withGeometry.geometry?.dispose();
    const material = withGeometry.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
