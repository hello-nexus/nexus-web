import { BoxGeometry, BufferGeometry, DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, LessEqualDepth, Mesh, MeshBasicMaterial } from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { monitorCurve, type DeskBox } from './deskScene';
import { CASE_ID, lineMaterial, type Dimmable, type Palette, type Style, type Vec3 } from './pcScene';

const DIMMED = 0.22;
// How much more opaque the faces of the picked part are drawn in the case view.
const PICKED_FACE_BOOST = 0.25;
// How much a hovered item's faces gain in a desk view, where hover is a tint and the outline is the selection's.
const HOVER_TINT = 0.12;

const SEGMENTS = 16;
// A vertical line every this many segments, ends included, shows the curve on the front.
const RIB_EVERY = 4;

/**
 * A curved monitor panel standing on its center: an arc of segments seen from above, extruded by the panel's height.
 * Its edges bow toward +Z, the viewer. `size` is the panel's bounding box [chord, height, depth including the bow].
 */
export function curvedPanel(size: [number, number, number], radius: number): { geometry: BufferGeometry; edges: number[] } {
  const [chord, height, total] = size;
  const theta = 2 * Math.asin(Math.min(1, chord / (2 * radius)));
  const { sag } = monitorCurve(radius * theta, radius);
  const depth = Math.max(1, total - sag);
  // Front and back arcs share one center of curvature; the bounding box's middle is the origin.
  const zMid = (sag - depth) / 2;
  const arc = (r: number, i: number): [number, number] => {
    const a = -theta / 2 + (theta * i) / SEGMENTS;
    return [r * Math.sin(a), radius - r * Math.cos(a) - zMid];
  };
  const point = (r: number, i: number, top: boolean): [number, number, number] => {
    const [x, z] = arc(r, i);
    return [x, top ? height / 2 : -height / 2, z];
  };
  const front = (i: number, top: boolean) => point(radius, i, top);
  const back = (i: number, top: boolean) => point(radius + depth, i, top);

  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const edges: number[] = [];
  const line = (a: number[], b: number[]) => edges.push(...a, ...b);
  for (let i = 0; i < SEGMENTS; i++) {
    quad(front(i, true), front(i, false), front(i + 1, false), front(i + 1, true));
    quad(back(i, true), back(i, false), back(i + 1, false), back(i + 1, true));
    quad(front(i, true), front(i + 1, true), back(i + 1, true), back(i, true));
    quad(front(i, false), front(i + 1, false), back(i + 1, false), back(i, false));
    for (const top of [true, false]) {
      line(front(i, top), front(i + 1, top));
      line(back(i, top), back(i + 1, top));
    }
  }
  for (const i of [0, SEGMENTS]) {
    quad(front(i, true), front(i, false), back(i, false), back(i, true));
    for (const top of [true, false]) line(front(i, top), back(i, top));
  }
  for (let i = 0; i <= SEGMENTS; i += RIB_EVERY) line(front(i, true), front(i, false));
  for (const i of [0, SEGMENTS]) line(back(i, true), back(i, false));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return { geometry, edges };
}

// A desk item or the desk slab: a plain box in scene space, in the case's fat-line style. A turned item stands in a
// group at its pivot, so its boxes turn together about the item's center.
export function buildDeskBox(box: DeskBox, palette: Palette, materials: LineMaterial[], pickables: Mesh[], dimmables: Dimmable[]): Group {
  const isDesk = box.kind === 'desk';
  const style: Style = isDesk
    ? { color: palette.frame, width: 1, opacity: 0.55, dashed: false, face: 0.03 }
    : { color: palette.part, width: 1.6, opacity: 1, dashed: false, face: 0.07 };
  const curved = box.curveRadius ? curvedPanel(box.size, box.curveRadius) : null;
  const shape = curved ? curved.geometry : new BoxGeometry(...box.size);
  const side = curved ? { side: DoubleSide } : {};
  const center: Vec3 = [box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2];
  const pivot = box.pivot ?? [center[0], center[2]];
  const outer = new Group();
  outer.position.set(pivot[0], 0, pivot[1]);
  outer.rotation.y = ((box.yaw ?? 0) * Math.PI) / 180;
  if (box.id) outer.userData.moveIds = box.rideId ? [box.id, box.rideId] : [box.id];
  const node = new Group();
  if (box.tilt) {
    // Turned about its hinge line: the node hangs from a group at the hinge, which carries the lean.
    const hinge = new Group();
    hinge.position.set(0, box.tilt.y, box.tilt.z - pivot[1]);
    hinge.rotation.x = (box.tilt.deg * Math.PI) / 180;
    node.position.set(center[0] - pivot[0], center[1] - box.tilt.y, center[2] - box.tilt.z);
    hinge.add(node);
    outer.add(hinge);
  } else {
    node.position.set(center[0] - pivot[0], center[1], center[2] - pivot[1]);
    outer.add(node);
  }
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const dimmable: Dimmable | null = box.id ? { id: box.id, materials: [], base: [] } : null;
  if (!isDesk) node.add(new Mesh(shape, new MeshBasicMaterial({ colorWrite: false, ...side, ...offset })));
  const face = new Mesh(shape, new MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.face, depthWrite: false, depthFunc: LessEqualDepth, ...side, ...offset }));
  if (box.id) {
    face.userData.select = box.id;
    pickables.push(face);
    dimmable?.materials.push(face.material);
    dimmable?.base.push(style.face);
  }
  node.add(face);
  const material = lineMaterial(style, materials);
  dimmable?.materials.push(material);
  dimmable?.base.push(style.opacity);
  if (dimmable) dimmables.push(dimmable);
  const edges = new LineSegments2(curved ? new LineSegmentsGeometry().setPositions(curved.edges) : new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(shape, 10)), material);
  edges.renderOrder = 1;
  node.add(edges);
  return outer;
}

/** The boxes of a desk, each drawn as a box in scene space: what Build's desk view and Lighting's canvas both put on screen. */
export function buildDeskBoxes(boxes: DeskBox[], palette: Palette, materials: LineMaterial[], pickables: Mesh[], dimmables: Dimmable[]): Group {
  const root = new Group();
  for (const box of boxes) root.add(buildDeskBox(box, palette, materials, pickables, dimmables));
  return root;
}

/**
 * Marks the highlighted item. `dim` (the case view) fades everything else; `tint` (the desk view) leaves the rest alone and
 * washes the item's faces. The case holds every part, so highlighting it dims nothing.
 */
export function applyHighlight(dimmables: Dimmable[], highlight: string | null, mode: 'dim' | 'tint' = 'dim', part: string | null = null) {
  // In the desk view only the case's own parts dim and show; the desk's items are never part of that.
  const ofCase = (id: string) => id !== CASE_ID && !id.startsWith('desk:');
  const focusId = mode === 'dim' ? (highlight !== null && highlight !== CASE_ID ? highlight : null) : part;
  const shownId = mode === 'tint' && part !== null ? part : highlight;
  for (const d of dimmables) {
    const scoped = mode === 'dim' || ofCase(d.id);
    const picked = focusId !== null && scoped && d.id === focusId;
    const factor = focusId !== null && scoped && !picked ? DIMMED : 1;
    const tinted = mode === 'tint' && d.id === highlight;
    d.materials.forEach((m, i) => {
      // Fat lines carry a width; a face does not, and only faces take the tint.
      const isFace = !('linewidth' in m);
      // The picked part reads in full and shows through whatever stands in front of it, so a part behind a cooler or a card is still seen.
      m.opacity = picked ? (isFace ? Math.min(1, d.base[i] + PICKED_FACE_BOOST) : 1) : Math.min(1, d.base[i] * factor + (tinted && isFace ? HOVER_TINT : 0));
      m.depthTest = !picked;
    });
    if (d.node) d.node.visible = d.id === shownId;
  }
}
