// The desk around the case in the 3D view: boxes in scene space (mm, +Y up, desk top at y = 0, +Z toward the user,
// +X right), the case at DESK_SPOT. Sizes come from catalog dimensions, else the desk catalog defaults. Build lays its
// desk out here and Lighting draws its desk objects through the same boxes, so the two views share one model.

import { deskSpec, type DeskKind as AppDeskKind } from './deskCatalog';
import { CASE_ID, type Vec3 } from './pcScene';

// Where an item sits on the desk and how it is shaped, kept with its row.
export interface DeskPlacement {
  // Center on the desk in scene mm; both or neither.
  x?: number;
  z?: number;
  // Degrees about the vertical axis.
  yaw?: number;
  // A monitor's panel; absent means the catalog's, else straight.
  curved?: boolean;
  // The monitor the layout centers over the keyboard; only true is stored.
  main?: boolean;
}

export const normalizeYaw = (degrees: number): number => ((Math.round(degrees) % 360) + 360) % 360;

// Where a case first lands on the desk: right of the monitor, set back from the user.
export const DESK_SPOT: Vec3 = [620, 0, -120];

// The stated size and shape of a custom item, in mm.
export interface DeskCustom {
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  // A desk's shape: straight (the default) or an L, whose second arm (the return) has its own width and depth and stands on the left or right of the main arm.
  shape?: 'straight' | 'l';
  returnWidthMm?: number;
  returnDepthMm?: number;
  returnSide?: 'left' | 'right';
}

// What stands on the desk: a custom kind, or a laptop (a System's built-in panel, which has no catalog part).
export type DeskKind = 'keyboard' | 'mouse' | 'mousepad' | 'headphones' | 'speaker' | 'webcam' | 'monitor' | 'desk' | 'other' | 'laptop';

export interface DeskItem {
  // The id the 3D view and the row share: `desk:<kind>:<n>` for a catalog part, `desk:c:<custom id>` for a custom item, `desk:monitor:r<n>` for a reported monitor.
  id: string;
  kind: DeskKind;
  specs: Record<string, unknown> | null;
  custom: DeskCustom | null;
  // The host's own handle on the row the item belongs to, carried untouched.
  ref?: unknown;
  // What the item is, so a selection can tell that its id now names another item.
  token?: string;
  // The label the 3D view shows while the item is selected.
  name?: string;
  // A monitor's width to height ratio; absent uses the default ratio.
  aspect?: number;
  place?: DeskPlacement;
  // A curved monitor's radius in mm; null or absent is a flat panel.
  curveRadius?: number | null;
}

export interface DeskBox {
  // `DESK_ID` for the desk and its legs, the item's id for what stands on it.
  id: string | null;
  kind: DeskKind;
  min: Vec3;
  size: Vec3;
  // Turn about the vertical axis through pivot, degrees.
  yaw?: number;
  pivot?: [number, number];
  // The item this box travels with (a webcam standing on a monitor).
  rideId?: string;
  // A curved panel's radius in mm; the box is its bounding box.
  curveRadius?: number;
  // The box leans about a hinge line along x at this height and depth (scene mm, before the item's turn).
  tilt?: { deg: number; y: number; z: number };
  // A desk leg.
  leg?: boolean;
}

// Where an item stands: center, turn, footprint and its rotated half extents, and its vertical middle.
export interface DeskSpot {
  kind: DeskKind | 'case';
  cx: number;
  cz: number;
  yaw: number;
  w: number;
  d: number;
  hw: number;
  hd: number;
  // The footprint that must stay on the desk: the panel's, or wider and deeper where a monitor's foot reaches past it.
  reachW: number;
  reachD: number;
  // Height of the middle and of the top.
  y: number;
  top: number;
}

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/**
 * The surface of the desk: the box that holds it, less `notch`, the corner an L leaves empty. `main` is the main arm (the
 * straight desk is only that); `ret` is the L's second arm, whose part beyond the main arm is its own surface.
 */
export interface DeskRect extends Rect {
  notch?: Rect;
  main?: Rect;
  ret?: Rect;
}

export interface DeskLayout {
  boxes: DeskBox[];
  bounds: { min: Vec3; max: Vec3; size: Vec3; center: Vec3 };
  // The case footprint's center on the desk, scene mm.
  caseSpot: Vec3;
  caseYaw: number;
  rect: DeskRect;
  // The main arm's width and depth, the size the desk is stated at.
  size: { w: number; d: number };
  // Items (and the case) the desk is too small for, drawn beside it.
  unfit: string[];
  // The size a desk would need to hold everything at its default spot, in mm.
  needed: { w: number; d: number };
  // The floor area around the desk, where what does not fit on the desk stands: the desk's rect grown by a margin, and the
  // spots already out there.
  floor: DeskRect;
  // The monitor the layout centers over the keyboard.
  mainId: string | null;
  // Every item by id, and the case as `case`.
  spots: Record<string, DeskSpot>;
}


export { CASE_ID };
// What a click on the desk itself selects, whether or not a desk item stands behind it.
export const DESK_ID = 'desk:surface';

export const DEFAULT_CURVE_RADIUS = 1800;
const MIN_RADIUS = 800;
const MAX_RADIUS = 4000;

/** The radius a catalog title states (1500R) or implies (Curved); null for a flat panel. */
export function catalogCurve(title: string | undefined): number | null {
  const stated = title ? /\b(\d{3,4})\s?R\b/.exec(title) : null;
  if (stated) return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Number(stated[1])));
  return title && /\bcurved\b/i.test(title) ? DEFAULT_CURVE_RADIUS : null;
}

/** The radius a monitor is drawn at: the user's choice, else its catalog title's. */
export function curveRadius(place: DeskPlacement | undefined, title: string | undefined): number | null {
  if (place?.curved === false) return null;
  return catalogCurve(title) ?? (place?.curved === true ? DEFAULT_CURVE_RADIUS : null);
}

/** A curved panel of this arc length: its chord, the sag of its edges toward the viewer, and the angle it spans. */
export function monitorCurve(arc: number, radius: number): { theta: number; chord: number; sag: number } {
  const theta = Math.min(arc / radius, Math.PI * MAX_ARC_SHARE);
  return { theta, chord: 2 * radius * Math.sin(theta / 2), sag: radius * (1 - Math.cos(theta / 2)) };
}

/** Half extents of a w by d footprint turned by yaw degrees. */
export function halfExtents(w: number, d: number, yaw: number): { hw: number; hd: number } {
  const a = (yaw * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { hw: (w * c + d * s) / 2, hd: (w * s + d * c) / 2 };
}

// The L's arms when the desk is one: a second arm that reaches toward the user from one end of the main arm.
export const DEFAULT_RETURN: [number, number] = [600, 1200];

/** The main arm of a desk surface (the whole of a straight one). */
export const mainArmOf = (rect: DeskRect): Rect => rect.main ?? rect;

/** Half extents of what must stay on the desk for a spot, at a turn (its own by default). */
export function keepExtents(spot: Pick<DeskSpot, 'reachW' | 'reachD' | 'yaw'>, yaw = spot.yaw): { hw: number; hd: number } {
  return halfExtents(spot.reachW, spot.reachD, yaw);
}

/** Whether a spot's whole footprint, a monitor's foot included, is on the desk; off it, the item stands on the floor. */
export function isOnDesk(spot: DeskSpot, rect: DeskRect): boolean {
  const keep = keepExtents(spot);
  return within(spot.cx, spot.cz, keep.hw, keep.hd, rect);
}

/** The center nearest a point that keeps a footprint with these half extents on the desk; a footprint larger than the desk centers on it. */
export function clampCenter(cx: number, cz: number, hw: number, hd: number, rect: DeskRect): [number, number] {
  const fit = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const x = fit(cx, rect.x0 + hw, rect.x1 - hw);
  const z = fit(cz, rect.z0 + hd, rect.z1 - hd);
  const n = rect.notch;
  if (!n || !overlapsRect(x, z, hw, hd, n)) return [x, z];
  // Over the corner an L leaves empty: out by the nearest side of it that still leaves the footprint on the desk.
  const options: [number, number][] = [];
  if (n.x0 - hw >= rect.x0 + hw - hw) options.push([n.x0 - hw, z]);
  if (n.x1 + hw <= rect.x1) options.push([n.x1 + hw, z]);
  if (n.z0 - hd >= rect.z0) options.push([x, n.z0 - hd]);
  if (n.z1 + hd <= rect.z1) options.push([x, n.z1 + hd]);
  const fitting = options.filter(([ox, oz]) => !overlapsRect(ox, oz, hw, hd, n) && ox - hw >= rect.x0 - TOLERANCE && ox + hw <= rect.x1 + TOLERANCE && oz - hd >= rect.z0 - TOLERANCE && oz + hd <= rect.z1 + TOLERANCE);
  if (fitting.length === 0) return [x, z];
  return fitting.reduce((best, o) => (Math.hypot(o[0] - cx, o[1] - cz) < Math.hypot(best[0] - cx, best[1] - cz) ? o : best));
}

// Scene yaw maps (x, z) by three.js's rotation about +Y.
const turn = (x: number, z: number, yaw: number): [number, number] => {
  const a = (yaw * Math.PI) / 180;
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
};

const DESK_THICKNESS = 30;
const DEFAULT_DESK: [number, number] = [1600, 800];
// Room kept between the farthest item and the default desk's edge when the items outgrow it.
const DESK_MARGIN = 120;
const WEBCAM: Vec3 = [95, 30, 35];
const OTHER: Vec3 = [120, 60, 120];
// A laptop's base: width, thickness and depth.
const LAPTOP: Vec3 = [315, 18, 220];
// The open lid's height, which is also how far it stands above the base.
const LID_HEIGHT = 210;
const LID_THICKNESS = 8;
// How far the lid leans back from upright, degrees.
const LID_LEAN = 10;
// The step a desk's needed size is rounded up by.
const NEEDED_STEP = 50;
// How far from a drop that overlaps a free spot is looked for.
export const FREE_RADIUS = 200;
// How far the floor lies below the desk top, where items that do not fit on the desk stand. A drawn height, shorter than a real desk's, so the legs fit the view without shrinking what is on the desk.
export const DESK_HEIGHT = 580;
// How far the floor around the desk reaches past its edges.
const FLOOR_MARGIN = 1200;
// Room left between the desk and an item pushed off it onto the floor.
const FLOOR_GAP = 20;
// The width and depth of a desk leg.
const LEG_SIZE = 40;
const STAND_HEIGHT = 70;
const STAND_BASE_HEIGHT = 12;
const STAND_BASE_DEPTH = 200;
const STAND_NECK: [number, number] = [50, 30];
const PANEL_DEPTH = 30;
const BEZEL = 24;
const MM_PER_INCH = 25.4;
// Room left between neighbors at the default layout.
const GAP = 30;
// Room kept between the case and whatever stands beside it.
const CASE_CLEARANCE = 2 * GAP;
// The widest a monitor's foot is drawn, and its share of the panel's width.
const BASE_WIDTH_SHARE = 0.4;
const MAX_BASE_WIDTH = 280;
// How far the sides of a curved panel may wrap, as a share of a half turn.
const MAX_ARC_SHARE = 0.9;
// Back of the desk, where a webcam stands when no monitor carries it, and the step between several.
const WEBCAM_HOME_Z = -300;
const WEBCAM_STEP_Z = 40;
// How far in front of the keyboard row an item of no known kind sits.
const OTHER_ROW_OFFSET = 200;
// How far a monitor beside the first turns in toward the user, degrees.
const WING_ANGLE = 15;

const APP_KIND: Partial<Record<DeskKind, AppDeskKind>> = {
  keyboard: 'keyboard', mouse: 'mouse', mousepad: 'mousepad', headphones: 'headset', speaker: 'speaker', monitor: 'monitor',
};

const dim = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

/** The default size [width, height, depth] of a kind, from the app's desk catalog. */
export function defaultSize(kind: DeskKind): Vec3 {
  if (kind === 'laptop') return [...LAPTOP];
  if (kind === 'webcam') return [...WEBCAM];
  if (kind === 'other') return [...OTHER];
  if (kind === 'desk') return [DEFAULT_DESK[0], DESK_THICKNESS, DEFAULT_DESK[1]];
  return [...deskSpec(APP_KIND[kind]!).size];
}

/** An item's size [width, height, depth] in mm: catalog dimensions axis by axis, a monitor's from its screen size at its aspect, else the defaults. */
export function itemSize(item: DeskItem): Vec3 {
  const base = defaultSize(item.kind);
  if (item.kind === 'monitor') {
    const inches = dim(item.specs?.screenSize);
    if (!inches) return [dim(item.custom?.widthMm) ?? base[0], dim(item.custom?.heightMm) ?? base[1], dim(item.custom?.depthMm) ?? base[2]];
    const diagonal = inches * MM_PER_INCH;
    const aspect = item.aspect ?? 16 / 9;
    const unit = Math.hypot(aspect, 1);
    return [(diagonal * aspect) / unit + BEZEL, diagonal / unit + BEZEL, PANEL_DEPTH];
  }
  if (item.kind === 'desk') return [item.custom?.widthMm ?? base[0], base[1], item.custom?.depthMm ?? base[2]];
  if (item.kind === 'other') return [item.custom?.widthMm ?? base[0], dim(item.custom?.heightMm) ?? base[1], item.custom?.depthMm ?? base[2]];
  // A custom item with a stated size (one migrated from the lighting scene) keeps it, whatever its kind.
  return [dim(item.specs?.widthMm) ?? dim(item.custom?.widthMm) ?? base[0], dim(item.specs?.heightMm) ?? dim(item.custom?.heightMm) ?? base[1], dim(item.specs?.depthMm) ?? dim(item.custom?.depthMm) ?? base[2]];
}

interface Footprint { cx: number; cz: number; w: number; d: number }

const inside = (inner: Footprint, outer: Footprint) => Math.abs(inner.cx - outer.cx) <= outer.w / 2 && Math.abs(inner.cz - outer.cz) <= outer.d / 2;

const hasXZ = (place: DeskPlacement | undefined): place is DeskPlacement & { x: number; z: number } => place?.x !== undefined && place?.z !== undefined;

// An item's footprint [width, height, depth]: a curved panel is its chord wide and its edges' sag deeper.
function footprint(item: DeskItem): Vec3 {
  const [w, h, d] = itemSize(item);
  if (item.kind !== 'monitor' || !item.curveRadius) return [w, h, d];
  const { chord, sag } = monitorCurve(w, item.curveRadius);
  return [chord, h, d + sag];
}

const TOLERANCE = 1;
// Whether a footprint reaches into a rect by more than touching it.
const overlapsRect = (cx: number, cz: number, hw: number, hd: number, r: Rect) => cx + hw > r.x0 + TOLERANCE && cx - hw < r.x1 - TOLERANCE && cz + hd > r.z0 + TOLERANCE && cz - hd < r.z1 - TOLERANCE;

// Whether a footprint lies on the surface: inside the box that holds it and clear of the corner an L leaves empty.
const within = (cx: number, cz: number, hw: number, hd: number, rect: DeskRect) => cx - hw >= rect.x0 - TOLERANCE && cx + hw <= rect.x1 + TOLERANCE && cz - hd >= rect.z0 - TOLERANCE && cz + hd <= rect.z1 + TOLERANCE && !(rect.notch && overlapsRect(cx, cz, hw, hd, rect.notch));

// Whether a footprint lies wholly off the surface, touching it at most: outside its box, or wholly in the corner an L leaves empty.
const apart = (cx: number, cz: number, hw: number, hd: number, rect: DeskRect) => cx + hw <= rect.x0 + TOLERANCE || cx - hw >= rect.x1 - TOLERANCE || cz + hd <= rect.z0 + TOLERANCE || cz - hd >= rect.z1 - TOLERANCE
  || (rect.notch !== undefined && cx - hw >= rect.notch.x0 - TOLERANCE && cx + hw <= rect.notch.x1 + TOLERANCE && cz - hd >= rect.notch.z0 - TOLERANCE && cz + hd <= rect.notch.z1 + TOLERANCE);

interface TurnedRect { cx: number; cz: number; w: number; d: number; yaw: number }

/** Whether two turned footprints overlap, by the separating axis test; footprints that only touch do not. */
export function overlaps(a: TurnedRect, b: TurnedRect): boolean {
  const corners = (r: TurnedRect) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const [x, z] = turn((sx * r.w) / 2, (sz * r.d) / 2, r.yaw);
    return [r.cx + x, r.cz + z];
  });
  const [pa, pb] = [corners(a), corners(b)];
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const axis = [z1 - z2, x2 - x1];
      const project = (points: number[][]) => points.map(([x, z]) => x * axis[0] + z * axis[1]);
      const [ra, rb] = [project(pa), project(pb)];
      if (Math.max(...ra) <= Math.min(...rb) + TOLERANCE || Math.max(...rb) <= Math.min(...ra) + TOLERANCE) return false;
    }
  }
  return true;
}

// Pairs of kinds that may share floor space because one stands on the other.
const STANDS_ON: [string, string][] = [['mouse', 'mousepad'], ['webcam', 'monitor'], ['webcam', 'laptop'], ['other', 'mousepad']];
const mayOverlap = (a: string, b: string) => STANDS_ON.some(([top, base]) => (a === top && b === base) || (b === top && a === base));

/** The ids that travel with an item (a webcam standing on a monitor). */
const ridersOf = (layout: DeskLayout, id: string) => new Set(layout.boxes.filter((b) => b.rideId === id && b.id).map((b) => b.id!));

/** Whether an item moved to this center would overlap another item or the case. */
export function collidesAt(layout: DeskLayout, id: string, cx: number, cz: number, yaw?: number): boolean {
  const self = layout.spots[id];
  if (!self) return false;
  const riders = ridersOf(layout, id);
  // What counts is the whole footprint, a monitor's foot included, so a panel cannot be dropped with its foot on a keyboard.
  const whole = (spot: DeskSpot, x = spot.cx, z = spot.cz, turn = spot.yaw): TurnedRect => ({ cx: x, cz: z, w: spot.reachW, d: spot.reachD, yaw: turn });
  return Object.entries(layout.spots).some(([other, spot]) => other !== id && !riders.has(other) && !mayOverlap(self.kind, spot.kind)
    && overlaps(whole(self, cx, cz, yaw ?? self.yaw), whole(spot)));
}

/**
 * Where an item ends up at a turn, from a wanted center: held on the desk (or on the floor, for an item beside it) by the
 * least the turned footprint needs, the way the layout holds a stored spot.
 */
export function settledAt(layout: DeskLayout, id: string, cx: number, cz: number, yaw: number): [number, number] {
  const self = layout.spots[id];
  const keep = keepExtents(self, yaw);
  return isOnDesk(self, layout.rect) ? clampCenter(cx, cz, keep.hw, keep.hd, layout.rect) : floorSpot(layout, id, cx, cz, yaw);
}

/** The center nearest a wanted one for an item standing on the floor: inside the floor area and clear of the desk. */
export function floorSpot(layout: DeskLayout, id: string, cx: number, cz: number, yaw?: number): [number, number] {
  const self = layout.spots[id];
  const { hw, hd } = keepExtents(self, yaw ?? self.yaw);
  const [x, z] = clampCenter(cx, cz, hw, hd, layout.floor);
  const { rect } = layout;
  if (apart(x, z, hw, hd, rect)) return [x, z];
  // Over the desk's footprint: out by whichever side is nearest.
  const outs: [number, number][] = [[rect.x0 - hw - FLOOR_GAP, z], [rect.x1 + hw + FLOOR_GAP, z], [x, rect.z0 - hd - FLOOR_GAP], [x, rect.z1 + hd + FLOOR_GAP]];
  const nearest = outs.reduce((best, o) => (Math.hypot(o[0] - x, o[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? o : best));
  return clampCenter(nearest[0], nearest[1], hw, hd, layout.floor);
}

/** The free center nearest a wanted one, within FREE_RADIUS and on the desk (or the floor, for `onFloor`); null when there is none. */
export function freeSpot(layout: DeskLayout, id: string, cx: number, cz: number, onFloor = false, yaw?: number): [number, number] | null {
  const self = layout.spots[id];
  if (!self) return null;
  const candidates: [number, number][] = [];
  for (let dx = -FREE_RADIUS; dx <= FREE_RADIUS; dx += SNAP_STEP) {
    for (let dz = -FREE_RADIUS; dz <= FREE_RADIUS; dz += SNAP_STEP) {
      if (Math.hypot(dx, dz) <= FREE_RADIUS) candidates.push([dx, dz]);
    }
  }
  candidates.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const [dx, dz] of candidates) {
    const keep = keepExtents(self, yaw ?? self.yaw);
    const [x, z] = onFloor ? floorSpot(layout, id, cx + dx, cz + dz, yaw) : clampCenter(cx + dx, cz + dz, keep.hw, keep.hd, layout.rect);
    if (!collidesAt(layout, id, x, z, yaw)) return [x, z];
  }
  return null;
}

// The step between candidate spots when a free one is looked for.
const SNAP_STEP = 10;

/** The boxes of a monitor's stand under a panel centered at (cx, cz): its foot and neck, standing on `drop`. */
export function monitorStand(cx: number, cz: number, drop: number, baseW: number): [Vec3, Vec3][] {
  return [
    [[cx - baseW / 2, drop, cz - STAND_BASE_DEPTH / 2], [baseW, STAND_BASE_HEIGHT, STAND_BASE_DEPTH]],
    [[cx - STAND_NECK[0] / 2, drop + STAND_BASE_HEIGHT, cz - STAND_NECK[1] / 2], [STAND_NECK[0], STAND_HEIGHT - STAND_BASE_HEIGHT, STAND_NECK[1]]],
  ];
}

/** The width of a monitor's foot for a panel this wide. */
export const monitorBaseWidth = (panelWidth: number): number => Math.min(panelWidth * BASE_WIDTH_SHARE, MAX_BASE_WIDTH);

/** A laptop's open lid, leaning back from the hinge at the rear of a base `w` by `h` by `d` centered at (cx, cz). */
export function laptopLid(cx: number, cz: number, drop: number, w: number, h: number, d: number): { min: Vec3; size: Vec3; tilt: { deg: number; y: number; z: number } } {
  return { min: [cx - w / 2, drop + h, cz - d / 2], size: [w, LID_HEIGHT, LID_THICKNESS], tilt: { deg: -LID_LEAN, y: drop + h, z: cz - d / 2 + LID_THICKNESS / 2 } };
}

/** The desk surface with an L's second arm: `ret` reaches toward the user from one end of the main arm `arm`. */
export function lDeskRect(arm: Rect, ret: Rect): DeskRect {
  const rect: DeskRect = { ...arm, ret, main: arm };
  if (ret.z1 > arm.z1) {
    rect.z1 = ret.z1;
    const rw = ret.x1 - ret.x0;
    if (rw < arm.x1 - arm.x0) rect.notch = ret.x1 === arm.x1 ? { x0: arm.x0, x1: arm.x1 - rw, z0: arm.z1, z1: ret.z1 } : { x0: arm.x0 + rw, x1: arm.x1, z0: arm.z1, z1: ret.z1 };
  }
  return rect;
}

/** The slabs of a desk surface: the main arm, and the part of an L's second arm beyond it. */
export function deskSlabBoxes(rect: DeskRect): DeskBox[] {
  const { x0, x1, z0, z1 } = mainArmOf(rect);
  const slabs: DeskBox[] = [{ id: DESK_ID, kind: 'desk', min: [x0, -DESK_THICKNESS, z0], size: [x1 - x0, DESK_THICKNESS, z1 - z0] }];
  if (rect.ret && rect.z1 > z1) slabs.push({ id: DESK_ID, kind: 'desk', min: [rect.ret.x0, -DESK_THICKNESS, z1], size: [rect.ret.x1 - rect.ret.x0, DESK_THICKNESS, rect.z1 - z1] });
  return slabs;
}

/** The legs of a desk surface, at its corners: four on a straight desk, six on an L. */
export function deskLegBoxes(rect: DeskRect): DeskBox[] {
  const legs: DeskBox[] = [];
  const legAt = (lx: number, lz: number, sx: number, sz: number) => legs.push({
    id: DESK_ID,
    kind: 'desk',
    min: [sx < 0 ? lx - LEG_SIZE : lx, -DESK_HEIGHT, sz < 0 ? lz - LEG_SIZE : lz],
    size: [LEG_SIZE, DESK_HEIGHT - DESK_THICKNESS, LEG_SIZE],
    leg: true,
  });
  const { x0, x1, z0, z1 } = mainArmOf(rect);
  if (rect.notch && rect.ret) {
    const right = rect.ret.x1 === x1;
    const zf = rect.z1;
    const rw = rect.ret.x1 - rect.ret.x0;
    const corners: [number, number, number, number][] = right
      ? [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, zf, -1, -1], [x1 - rw, zf, 1, -1], [x1 - rw, z1, 1, -1], [x0, z1, 1, -1]]
      : [[x1, z0, -1, 1], [x0, z0, 1, 1], [x0, zf, 1, -1], [x0 + rw, zf, -1, -1], [x0 + rw, z1, -1, -1], [x1, z1, -1, -1]];
    for (const [lx, lz, sx, sz] of corners) legAt(lx, lz, sx, sz);
  } else {
    for (const [lx, lz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, rect.z1, 1, -1], [x1, rect.z1, -1, -1]] as [number, number, number, number][]) legAt(lx, lz, sx, sz);
  }
  return legs;
}

/** An item as another view holds it: where it stands, and the box that holds all of it (a monitor's stand and a laptop's lid included). */
export interface PlacedItem {
  id: string;
  kind: DeskKind;
  // The footprint's center, and the height of the item's lowest point.
  cx: number;
  cz: number;
  minY: number;
  yaw: number;
  // The whole item's width, height and depth.
  size: Vec3;
  curveRadius?: number | null;
  // The height includes a stand under the panel, as a layout's exported monitor does.
  stand?: boolean;
}

/** The boxes that draw a placed item, the way the layout draws the same kind of item. */
export function placedItemBoxes(item: PlacedItem): DeskBox[] {
  const { id, kind, cx, cz, minY, yaw, size: [w, h, d] } = item;
  const boxes: DeskBox[] = [];
  const box = (part: DeskKind, min: Vec3, size: Vec3, extra: Partial<DeskBox> = {}) => boxes.push({ id, kind: part, min, size, ...(yaw ? { yaw } : {}), pivot: [cx, cz], ...extra });
  if (kind === 'monitor' && item.stand && h > STAND_HEIGHT) {
    box(kind, [cx - w / 2, minY + STAND_HEIGHT, cz - d / 2], [w, h - STAND_HEIGHT, d], item.curveRadius ? { curveRadius: item.curveRadius } : {});
    for (const [min, size] of monitorStand(cx, cz, minY, monitorBaseWidth(w))) box(kind, min, size);
  } else if (kind === 'laptop' && h > LAPTOP[1]) {
    box(kind, [cx - w / 2, minY, cz - d / 2], [w, LAPTOP[1], d]);
    const lid = laptopLid(cx, cz, minY, w, LAPTOP[1], d);
    box(kind, lid.min, lid.size, { tilt: lid.tilt });
  } else {
    box(kind, [cx - w / 2, minY, cz - d / 2], [w, h, d], kind === 'monitor' && item.curveRadius ? { curveRadius: item.curveRadius } : {});
  }
  return boxes;
}

/**
 * Lays the desk out. Defaults follow the app's desk catalog and avoid overlap: the main monitor (an explicit choice, else
 * the widest) stands over the keyboard, the others wing out either side turned in toward the user, speakers go past the
 * monitors, a laptop sits front-center or beside the keyboard, the mousepad and mouse sit right of the keyboard and the
 * case clear of everything. When a stated desk is too small for that, items are packed in rows on it, and what still
 * does not fit stands beside it. An item with a stored spot goes there when it fits on the desk, else falls back to its
 * default; one with only a turn keeps its default spot. The desk's size never depends on stored spots. A webcam with no
 * spot of its own stands on the main monitor and moves with it. caseSize is the case layout's [depth, width, height],
 * absent when no case is chosen.
 */
export function layoutDesk(items: DeskItem[], caseSize: Vec3 | null, casePlace?: DeskPlacement): DeskLayout {
  const boxes: DeskBox[] = [];
  const sizes = new Map(items.map((item) => [item.id, footprint(item)]));
  const sizeOf = (item: DeskItem) => sizes.get(item.id)!;
  const ofKind = (kind: DeskKind) => items.filter((item) => item.kind === kind);
  const home = (kind: DeskKind) => deskSpec(APP_KIND[kind]!).home;

  // Default spots and turns, from the catalog's placement alone.
  const defaults = new Map<string, { cx: number; cz: number; yaw: number }>();
  const allMonitors = ofKind('monitor');
  // Widest by the flat panel: a curved panel's chord is a little shorter, so judging by it would hand the middle to the other of two equal monitors the moment one is curved.
  const flatWidth = (m: DeskItem) => footprint({ ...m, curveRadius: null })[0];
  const main = allMonitors.find((m) => m.place?.main) ?? allMonitors.reduce<DeskItem | null>((widest, m) => (!widest || flatWidth(m) > flatWidth(widest) ? m : widest), null);
  const monitors = main ? [main, ...allMonitors.filter((m) => m !== main)] : [];
  const keyboards = ofKind('keyboard');
  const laptops = ofKind('laptop');
  const [kbHomeX, , kbHomeZ] = home('keyboard');
  const keyboardX = keyboards.length > 0 ? kbHomeX : 0;
  const monitorZ = home('monitor')[2];
  let leftEdge = 0;
  let rightEdge = 0;
  monitors.forEach((item, n) => {
    const [w, , d] = sizeOf(item);
    if (n === 0) {
      defaults.set(item.id, { cx: keyboardX, cz: monitorZ, yaw: 0 });
      leftEdge = keyboardX - w / 2;
      rightEdge = keyboardX + w / 2;
      return;
    }
    // Wings alternate right and left; each turns in by the same angle and starts where its neighbor ends.
    const side = n % 2 === 1 ? 1 : -1;
    const yaw = -side * WING_ANGLE;
    const a = (WING_ANGLE * Math.PI) / 180;
    const anchorX = (side > 0 ? rightEdge : leftEdge) + side * GAP;
    const cx = anchorX + side * (w / 2) * Math.cos(a) + side * (d / 2) * Math.sin(a);
    const cz = monitorZ + (w / 2) * Math.sin(a);
    defaults.set(item.id, { cx, cz, yaw });
    const { hw } = halfExtents(w, d, yaw);
    if (side > 0) rightEdge = cx + hw;
    else leftEdge = cx - hw;
  });
  keyboards.forEach((item, n) => defaults.set(item.id, { cx: kbHomeX, cz: kbHomeZ + n * (sizeOf(item)[2] + GAP), yaw: 0 }));
  const kb = keyboards[0] ? { cx: kbHomeX, w: sizeOf(keyboards[0])[0] } : null;
  // A laptop stands front-center when it is the only thing to type on, else beside the keyboard.
  laptops.forEach((item, n) => {
    const [w, , d] = sizeOf(item);
    const cx = kb ? kb.cx - kb.w / 2 - GAP - w / 2 - n * (w + GAP) : n * (w + GAP);
    defaults.set(item.id, { cx, cz: kbHomeZ + (kb ? 0 : n * (d + GAP)), yaw: 0 });
  });
  const laptopsWidth = laptops.length > 0 && kb ? laptops.reduce((sum, l) => sum + sizeOf(l)[0] + GAP, 0) : 0;
  const pads = ofKind('mousepad');
  pads.forEach((item, n) => {
    const [w, , d] = sizeOf(item);
    const cx = kb ? kb.cx + kb.w / 2 + GAP + w / 2 : home('mousepad')[0];
    defaults.set(item.id, { cx, cz: kbHomeZ + n * (d + GAP), yaw: 0 });
  });
  const padSpot = pads[0] ? defaults.get(pads[0].id)! : null;
  ofKind('mouse').forEach((item, n) => {
    const [w] = sizeOf(item);
    const cx = padSpot ? padSpot.cx + n * (w + GAP) : kb ? kb.cx + kb.w / 2 + GAP + w / 2 + n * (w + GAP) : home('mouse')[0] + n * (w + GAP);
    defaults.set(item.id, { cx, cz: padSpot ? padSpot.cz : kbHomeZ, yaw: 0 });
  });
  ofKind('headphones').forEach((item, n) => {
    const [w] = sizeOf(item);
    const cx = kb ? kb.cx - kb.w / 2 - laptopsWidth - GAP - w / 2 - n * (w + GAP) : home('headphones')[0] - n * (w + GAP);
    defaults.set(item.id, { cx, cz: kbHomeZ, yaw: 0 });
  });
  const reachLeft = Math.min(leftEdge, -600);
  const reachRight = Math.max(rightEdge, 600);
  ofKind('speaker').forEach((item, n) => {
    const [w] = sizeOf(item);
    const step = Math.floor(n / 2) * (w + GAP);
    const side = n % 2 === 0 ? -1 : 1;
    const edge = side < 0 ? reachLeft : reachRight;
    defaults.set(item.id, { cx: edge + side * (GAP + w / 2 + step), cz: home('speaker')[2], yaw: 0 });
  });
  ofKind('other').forEach((item, n) => {
    const [w, , d] = sizeOf(item);
    defaults.set(item.id, { cx: kbHomeX + n * (w + GAP), cz: kbHomeZ + OTHER_ROW_OFFSET + d / 2, yaw: 0 });
  });
  const carrier = main;
  const webcams = ofKind('webcam');
  const rides = (item: DeskItem, n: number) => carrier !== null && n === 0 && !hasXZ(item.place);
  const setWebcamDefaults = () => webcams.forEach((item, n) => {
    const at = rides(item, n) ? defaults.get(carrier!.id)! : { cx: n * (sizeOf(item)[0] + GAP), cz: WEBCAM_HOME_Z + n * WEBCAM_STEP_Z, yaw: 0 };
    defaults.set(item.id, at);
  });
  setWebcamDefaults();

  // The case starts beside the app's monitor, or past everything else on the desk.
  const caseDims = caseSize ? { w: caseSize[1], d: caseSize[0], h: caseSize[2] } : null;
  let occupiedRight = -Infinity;
  for (const item of items) {
    const at = defaults.get(item.id);
    if (!at || item.kind === 'desk') continue;
    const [w, , d] = sizeOf(item);
    occupiedRight = Math.max(occupiedRight, at.cx + halfExtents(w, d, at.yaw).hw);
  }
  let caseHome: [number, number] = [caseDims && Number.isFinite(occupiedRight) ? Math.max(DESK_SPOT[0], occupiedRight + CASE_CLEARANCE + caseDims.w / 2) : DESK_SPOT[0], DESK_SPOT[2]];

  // The desk, from the default spots and the case's default spot.
  const lows: [number, number] = [Infinity, Infinity];
  const highs: [number, number] = [-Infinity, -Infinity];
  const reach = (cx: number, cz: number, hw: number, hd: number) => {
    lows[0] = Math.min(lows[0], cx - hw);
    highs[0] = Math.max(highs[0], cx + hw);
    lows[1] = Math.min(lows[1], cz - hd);
    highs[1] = Math.max(highs[1], cz + hd);
  };
  for (const item of items) {
    const at = defaults.get(item.id);
    if (!at) continue;
    const { hw, hd } = halfExtents(sizeOf(item)[0], sizeOf(item)[2], at.yaw);
    reach(at.cx, at.cz, hw, hd);
  }
  if (caseDims) reach(caseHome[0], caseHome[1], caseDims.w / 2, caseDims.d / 2);
  const custom = items.find((item) => item.kind === 'desk');
  // A stated size is the desk's own; an unstated one is the default, widened to hold everything on it.
  const span = (stated: number | undefined, fallback: number, low: number, high: number): [number, number] => (stated
    ? [-stated / 2, stated / 2]
    : [Math.min(-fallback / 2, low - DESK_MARGIN), Math.max(fallback / 2, high + DESK_MARGIN)]);
  const [x0, x1] = span(custom?.custom?.widthMm, DEFAULT_DESK[0], lows[0], highs[0]);
  const [z0, z1] = span(custom?.custom?.depthMm, DEFAULT_DESK[1], lows[1], highs[1]);
  // A straight desk is its main arm; an L adds a second arm reaching toward the user from one end.
  const arm: Rect = { x0, x1, z0, z1 };
  const isL = custom?.custom?.shape === 'l';
  let rect: DeskRect = { ...arm };
  if (isL) {
    const rw = Math.min(custom?.custom?.returnWidthMm ?? DEFAULT_RETURN[0], x1 - x0);
    const rd = custom?.custom?.returnDepthMm ?? DEFAULT_RETURN[1];
    const right = custom?.custom?.returnSide !== 'left';
    rect = lDeskRect(arm, right ? { x0: x1 - rw, x1, z0, z1: z0 + rd } : { x0, x1: x0 + rw, z0, z1: z0 + rd });
  }
  const roundUp = (mm: number) => Math.ceil(mm / NEEDED_STEP) * NEEDED_STEP;
  const needed = {
    w: roundUp(Number.isFinite(highs[0]) ? Math.max(DEFAULT_DESK[0], highs[0] - lows[0] + 2 * DESK_MARGIN) : DEFAULT_DESK[0]),
    d: roundUp(Number.isFinite(highs[1]) ? Math.max(DEFAULT_DESK[1], highs[1] - lows[1] + 2 * DESK_MARGIN) : DEFAULT_DESK[1]),
  };

  // A stated desk too small for the default spots: pack the items in rows on it, and stand what does not fit beside it.
  const beside = new Set<string>();
  const stated = Boolean(custom?.custom?.widthMm || custom?.custom?.depthMm);
  const fitsDefault = (cx: number, cz: number, w: number, d: number, yaw: number) => {
    const { hw, hd } = halfExtents(w, d, yaw);
    return within(cx, cz, hw, hd, rect);
  };
  const defaultsFit = items.every((item) => {
    const at = defaults.get(item.id);
    return !at || item.kind === 'desk' || fitsDefault(at.cx, at.cz, sizeOf(item)[0], sizeOf(item)[2], at.yaw);
  }) && (!caseDims || fitsDefault(caseHome[0], caseHome[1], caseDims.w, caseDims.d, 0));
  if (stated && !defaultsFit) {
    // The main arm: what the rows are packed on.
    const arm = mainArmOf(rect);
    const nested = (item: DeskItem, n: number) => (item.kind === 'mouse' && pads.length > 0) || (item.kind === 'webcam' && rides(item, n));
    // Who keeps the desk when it is short: what is typed on first, at the front, then the main monitor, and the rest by how
    // little the desk misses them, so extra monitors, speakers and the case are the first to stand on the floor.
    const rankOf = (item: DeskItem | null): number => {
      if (!item) return 5;
      if (item.kind === 'keyboard' || item.kind === 'mousepad' || item.kind === 'laptop' || item.kind === 'mouse') return 0;
      if (item === main) return 1;
      if (item.kind === 'monitor') return 3;
      if (item.kind === 'speaker') return 4;
      return 2;
    };
    type Piece = { id: string; w: number; d: number; rank: number; sub: number };
    // Within the front row the keyboard comes first, then the laptop, the mousepad and a mouse with no pad.
    const FRONT_ORDER: Partial<Record<DeskKind, number>> = { keyboard: 0, laptop: 1, mousepad: 2, mouse: 3 };
    const pieces: Piece[] = [
      ...items.filter((item) => item.kind !== 'desk' && !nested(item, webcams.indexOf(item))).map((item) => ({
        id: item.id,
        w: sizeOf(item)[0],
        // A monitor's foot reaches past its panel, and the desk must hold the foot.
        d: item.kind === 'monitor' ? Math.max(sizeOf(item)[2], STAND_BASE_DEPTH) : sizeOf(item)[2],
        rank: rankOf(item),
        sub: FRONT_ORDER[item.kind] ?? 0,
      })),
      ...(caseDims ? [{ id: CASE_ID, w: caseDims.w, d: caseDims.d, rank: rankOf(null), sub: 0 }] : []),
    ].sort((p, q) => p.rank - q.rank || p.sub - q.sub || q.w * q.d - p.w * p.d);
    let sideZ = rect.z0;
    // An L's second arm, past the main one, takes what ranks below the main monitor before anything goes to the floor.
    const ext = rect.ret && rect.z1 > arm.z1 + GAP ? { x0: rect.ret.x0, x1: rect.ret.x1, z0: arm.z1, z1: rect.z1 } : null;
    let extX = ext ? ext.x0 + GAP : 0;
    let extZ = ext ? ext.z0 + GAP : 0;
    let extRow = 0;
    const standBeside = (piece: Piece) => {
      if (ext && piece.rank >= 2) {
        if (extX + piece.w > ext.x1 - GAP && extX > ext.x0 + GAP) {
          extX = ext.x0 + GAP;
          extZ += extRow + GAP;
          extRow = 0;
        }
        if (extX + piece.w <= ext.x1 - GAP && extZ + piece.d <= ext.z1 - GAP) {
          const at = { cx: extX + piece.w / 2, cz: extZ + piece.d / 2 };
          extX += piece.w + GAP;
          extRow = Math.max(extRow, piece.d);
          return at;
        }
      }
      beside.add(piece.id);
      const at = { cx: rect.x1 + GAP + piece.w / 2, cz: sideZ + piece.d / 2 };
      sideZ += piece.d + GAP;
      return at;
    };
    const put = (piece: Piece, at: { cx: number; cz: number }) => {
      if (piece.id === CASE_ID) caseHome = [at.cx, at.cz];
      else defaults.set(piece.id, { ...at, yaw: 0 });
    };
    const midX = (arm.x0 + arm.x1) / 2;
    // The front row: centered along the desk's front edge.
    const front = pieces.filter((p) => p.rank === 0);
    const frontFits = (p: Piece) => p.w <= arm.x1 - arm.x0 - 2 * GAP && p.d <= arm.z1 - arm.z0 - 2 * GAP;
    const frontOn: Piece[] = [];
    let frontWidth = 0;
    for (const piece of front) {
      if (frontFits(piece) && frontWidth + (frontOn.length > 0 ? GAP : 0) + piece.w <= arm.x1 - arm.x0 - 2 * GAP) {
        frontWidth += (frontOn.length > 0 ? GAP : 0) + piece.w;
        frontOn.push(piece);
      } else put(piece, standBeside(piece));
    }
    // The main monitor outranks the last of the front row: when the desk is too shallow for both, that piece goes to the floor.
    const mainPiece = pieces.find((p) => p.rank === 1);
    const depthOf = (list: Piece[]) => list.reduce((deepest, p) => Math.max(deepest, p.d), 0);
    const backRoom = (list: Piece[]) => arm.z1 - GAP - (list.length > 0 ? depthOf(list) + GAP : 0) - (arm.z0 + GAP);
    while (mainPiece && frontOn.length > 0 && mainPiece.d > backRoom(frontOn)) {
      const dropped = frontOn.pop()!;
      frontWidth -= dropped.w + (frontOn.length > 0 ? GAP : 0);
      put(dropped, standBeside(dropped));
    }
    let frontX = midX - frontWidth / 2;
    let frontDepth = 0;
    for (const piece of frontOn) {
      put(piece, { cx: frontX + piece.w / 2, cz: arm.z1 - GAP - piece.d / 2 });
      frontX += piece.w + GAP;
      frontDepth = Math.max(frontDepth, piece.d);
    }
    // The back rows, in rank order, each centered; what no row can take stands beside the desk.
    const availW = arm.x1 - arm.x0 - 2 * GAP;
    const availD = arm.z1 - GAP - (frontDepth > 0 ? frontDepth + GAP : 0) - (arm.z0 + GAP);
    const rows: { on: Piece[]; w: number; d: number }[] = [];
    let usedD = 0;
    for (const piece of pieces.filter((p) => p.rank > 0)) {
      const row = rows[rows.length - 1];
      if (row && row.w + GAP + piece.w <= availW && usedD - row.d + Math.max(row.d, piece.d) <= availD) {
        usedD += Math.max(row.d, piece.d) - row.d;
        row.on.push(piece);
        row.w += GAP + piece.w;
        row.d = Math.max(row.d, piece.d);
      } else if (piece.w <= availW && usedD + (row ? GAP : 0) + piece.d <= availD) {
        usedD += (row ? GAP : 0) + piece.d;
        rows.push({ on: [piece], w: piece.w, d: piece.d });
      } else put(piece, standBeside(piece));
    }
    let rowZ = arm.z0 + GAP;
    for (const row of rows) {
      let x = midX - row.w / 2;
      for (const piece of row.on) {
        put(piece, { cx: x + piece.w / 2, cz: rowZ + piece.d / 2 });
        x += piece.w + GAP;
      }
      rowZ += row.d + GAP;
    }
    for (const item of ofKind('mouse')) {
      const pad = padSpot && defaults.get(pads[0].id);
      if (pads.length > 0 && pad) defaults.set(item.id, { cx: pad.cx, cz: pad.cz, yaw: 0 });
    }
    setWebcamDefaults();
  }

  // The floor around the desk, grown to hold whatever the packer already stood beside it.
  const floor: DeskRect = { x0: rect.x0 - FLOOR_MARGIN, x1: rect.x1 + FLOOR_MARGIN, z0: rect.z0 - FLOOR_MARGIN, z1: rect.z1 + FLOOR_MARGIN };
  for (const id of beside) {
    const at = id === CASE_ID ? { cx: caseHome[0], cz: caseHome[1] } : defaults.get(id);
    const piece = id === CASE_ID ? caseDims : (() => { const it = items.find((i) => i.id === id)!; return { w: sizeOf(it)[0], d: sizeOf(it)[2] }; })();
    if (!at || !piece) continue;
    floor.x0 = Math.min(floor.x0, at.cx - piece.w / 2 - FLOOR_GAP);
    floor.x1 = Math.max(floor.x1, at.cx + piece.w / 2 + FLOOR_GAP);
    floor.z0 = Math.min(floor.z0, at.cz - piece.d / 2 - FLOOR_GAP);
    floor.z1 = Math.max(floor.z1, at.cz + piece.d / 2 + FLOOR_GAP);
  }

  // Final spots: a stored spot that fits the desk or stands wholly on the floor beside it, else the default; either clamped on if it still hangs over.
  const spots: Record<string, DeskSpot> = {};
  let caseDrop = 0;
  // `reach` is what must stay on the desk when it is wider than the footprint (a monitor's foot reaches past its panel).
  const spotFor = (id: string, kind: DeskKind, base: { cx: number; cz: number; yaw: number }, w: number, d: number, y: number, place: DeskPlacement | undefined, reach?: { w: number; d: number }): DeskSpot => {
    const yaw = normalizeYaw(place?.yaw ?? base.yaw);
    const { hw, hd } = halfExtents(w, d, yaw);
    const held = reach ? halfExtents(Math.max(w, reach.w), Math.max(d, reach.d), yaw) : { hw, hd };
    let cx = base.cx;
    let cz = base.cz;
    let standsOnFloor = false;
    const stored = hasXZ(place);
    if (stored) {
      // A stored spot is where the user left the item: on the desk, wholly on the floor beside it, or else as near as the desk allows (a turn or a smaller desk can leave its footprint over an edge).
      [cx, cz] = [place.x, place.z];
      standsOnFloor = apart(place.x, place.z, held.hw, held.hd, rect) && within(place.x, place.z, held.hw, held.hd, floor);
    }
    if (!standsOnFloor && (stored || !beside.has(id)) && !within(cx, cz, held.hw, held.hd, rect)) [cx, cz] = clampCenter(cx, cz, held.hw, held.hd, rect);
    return (spots[id] = { kind, cx, cz, yaw, w, d, hw, hd, reachW: Math.max(w, reach?.w ?? 0), reachD: Math.max(d, reach?.d ?? 0), y, top: y });
  };
  // Where an item stands is judged from its final spot: off the desk it stands on the floor.
  const onDesk = (spot: DeskSpot) => isOnDesk(spot, rect);
  const dropOf = (spot: DeskSpot) => (onDesk(spot) ? 0 : -DESK_HEIGHT);
  // `grounded`: the height already accounts for what it stands on, so the floor drop is not applied again.
  const add = (item: DeskItem, spot: DeskSpot, floorY: number, rideId?: string, grounded = false) => {
    const minY = floorY + (grounded || rideId ? 0 : dropOf(spot));
    const [w, h, d] = sizeOf(item);
    const pivot: [number, number] = [spot.cx, spot.cz];
    const box = (kind: DeskKind, min: Vec3, size: Vec3, extra: Partial<DeskBox> = {}) => boxes.push({ id: item.id, kind, min, size, ...(spot.yaw ? { yaw: spot.yaw } : {}), pivot, ...(rideId ? { rideId } : {}), ...extra });
    box(item.kind, [spot.cx - w / 2, minY, spot.cz - d / 2], [w, h, d], item.curveRadius ? { curveRadius: item.curveRadius } : {});
    spots[item.id].y = minY + h / 2;
    spots[item.id].top = minY + h;
    return box;
  };
  const spotOf = (item: DeskItem, minY: number, reach?: { w: number; d: number }) => {
    const [w, h, d] = sizeOf(item);
    return spotFor(item.id, item.kind, defaults.get(item.id)!, w, d, minY + h / 2, item.place, reach);
  };

  let carrierTop: { id: string; spot: DeskSpot; top: number } | null = null;
  const monitorTops: { spot: DeskSpot; top: number }[] = [];
  for (const item of monitors) {
    const [w, h] = sizeOf(item);
    const baseW = monitorBaseWidth(w);
    const spot = spotOf(item, STAND_HEIGHT, { w: baseW, d: STAND_BASE_DEPTH });
    const box = add(item, spot, STAND_HEIGHT);
    const drop = dropOf(spot);
    for (const [min, size] of monitorStand(spot.cx, spot.cz, drop, baseW)) box('monitor', min, size);
    if (item === main) carrierTop = { id: item.id, spot, top: drop + STAND_HEIGHT + h };
    monitorTops.push({ spot, top: drop + STAND_HEIGHT + h });
  }

  laptops.forEach((item) => {
    const [, h] = sizeOf(item);
    const spot = spotOf(item, 0);
    const box = add(item, spot, 0);
    const [w, , d] = sizeOf(item);
    const drop = dropOf(spot);
    const lid = laptopLid(spot.cx, spot.cz, drop, w, h, d);
    box('laptop', lid.min, lid.size, { tilt: lid.tilt });
    spots[item.id].top = drop + h + LID_HEIGHT;
    spots[item.id].y = drop + (h + LID_HEIGHT) / 2;
  });

  pads.forEach((item) => add(item, spotOf(item, 0), 0));
  const pad: Footprint | null = pads[0] ? { cx: spots[pads[0].id].cx, cz: spots[pads[0].id].cz, w: sizeOf(pads[0])[0], d: sizeOf(pads[0])[2] } : null;
  const padHeight = pads[0] ? sizeOf(pads[0])[1] : 0;

  for (const kind of ['keyboard', 'headphones', 'other'] as const) ofKind(kind).forEach((item) => add(item, spotOf(item, 0), 0));
  ofKind('mouse').forEach((item) => {
    const [w, , d] = sizeOf(item);
    const probe = spotFor(item.id, item.kind, defaults.get(item.id)!, w, d, 0, item.place);
    const onPad = pad !== null && inside({ cx: probe.cx, cz: probe.cz, w, d }, pad);
    add(item, spotOf(item, onPad ? padHeight : 0), onPad ? padHeight : 0);
  });
  ofKind('speaker').forEach((item) => add(item, spotOf(item, 0), 0));
  webcams.forEach((item, n) => {
    if (carrierTop && rides(item, n)) {
      const [w, , d] = sizeOf(item);
      const spot = spotFor(item.id, item.kind, { cx: carrierTop.spot.cx, cz: carrierTop.spot.cz, yaw: carrierTop.spot.yaw }, w, d, 0, item.place);
      spot.cx = carrierTop.spot.cx;
      spot.cz = carrierTop.spot.cz;
      add(item, spot, carrierTop.top, carrierTop.id);
      return;
    }
    // A webcam let go over a monitor stands on its top.
    const spot = spotOf(item, 0);
    const under = monitorTops.find((m) => Math.abs(spot.cx - m.spot.cx) <= m.spot.hw && Math.abs(spot.cz - m.spot.cz) <= m.spot.hd);
    add(item, spot, under?.top ?? 0, undefined, Boolean(under));
  });

  const caseYaw = casePlace?.yaw ?? 0;
  let caseSpot: [number, number] = caseHome;
  if (caseDims) {
    const { hw, hd } = halfExtents(caseDims.w, caseDims.d, caseYaw);
    let caseOnFloor = false;
    const caseStored = hasXZ(casePlace);
    if (caseStored) {
      caseSpot = [casePlace.x, casePlace.z];
      caseOnFloor = apart(casePlace.x, casePlace.z, hw, hd, rect) && within(casePlace.x, casePlace.z, hw, hd, floor);
    }
    if (!caseOnFloor && (caseStored || !beside.has(CASE_ID)) && !within(caseSpot[0], caseSpot[1], hw, hd, rect)) caseSpot = clampCenter(caseSpot[0], caseSpot[1], hw, hd, rect);
    const spot: DeskSpot = { kind: 'case', cx: caseSpot[0], cz: caseSpot[1], yaw: caseYaw, w: caseDims.w, d: caseDims.d, hw, hd, reachW: caseDims.w, reachD: caseDims.d, y: caseDims.h / 2, top: caseDims.h };
    caseDrop = dropOf(spot);
    spot.y += caseDrop;
    spot.top += caseDrop;
    spots[CASE_ID] = spot;
  }
  // What stands off the desk is what does not fit, judged from where each item ended up, so one dragged back on is no longer beside.
  const unfit = Object.entries(spots).filter(([, spot]) => !onDesk(spot)).map(([id]) => id);
  // Every desk stands on legs at its corners, whatever stands on it or beside it.
  boxes.push(...deskLegBoxes(rect));
  boxes.unshift(...deskSlabBoxes(rect));

  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (min: Vec3, size: Vec3, yaw = 0, pivot: [number, number] = [0, 0]) => {
    const corners = [[min[0], min[2]], [min[0] + size[0], min[2]], [min[0], min[2] + size[2]], [min[0] + size[0], min[2] + size[2]]];
    for (const [px, pz] of corners) {
      const [rx, rz] = turn(px - pivot[0], pz - pivot[1], yaw);
      lo[0] = Math.min(lo[0], pivot[0] + rx);
      hi[0] = Math.max(hi[0], pivot[0] + rx);
      lo[2] = Math.min(lo[2], pivot[1] + rz);
      hi[2] = Math.max(hi[2], pivot[1] + rz);
    }
    lo[1] = Math.min(lo[1], min[1]);
    hi[1] = Math.max(hi[1], min[1] + size[1]);
  };
  for (const box of boxes) grow(box.min, box.size, box.yaw ?? 0, box.pivot);
  if (caseDims) grow([caseSpot[0] - caseDims.w / 2, caseDrop, caseSpot[1] - caseDims.d / 2], [caseDims.w, caseDims.h, caseDims.d], caseYaw, caseSpot);
  return {
    boxes,
    bounds: { min: lo, max: hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] },
    caseSpot: [caseSpot[0], caseDrop, caseSpot[1]],
    caseYaw,
    rect,
    size: { w: x1 - x0, d: z1 - z0 },
    unfit,
    needed,
    floor,
    mainId: main?.id ?? null,
    spots,
  };
}
