import { fanGeometries, type CaseBox, type CaseFanSlot, type CaseLayout, type Vec3 } from '../caseLayout';
import type { FanDirection } from '../pressureModel';
import {
  CFL_TARGET, DARCY_K, DOMAIN_MARGIN_MM, GRID_TARGET_CELLS, HEAT_REACH_CELLS, MAX_GRID_AXIS, EMITTERS_PER_60_CFM, MAX_EMITTER_ENTRIES, MAX_EMITTERS_PER_FAN, MIN_EMITTERS_PER_FAN, SPAWN_TRIES,
  MIN_FAN_HALF_THICKNESS_CELLS, MIN_GRID_AXIS, MIN_REFERENCE_SPEED, MOUNT_REACH_MM, EMITTER_STRIDE, FAN_CLEARANCE_MM, OUTSIDE_REACH_MM, OUTSIDE_SPAWN_FROM, OUTSIDE_SPAWN_TO,
} from './flowParams';
import { fanRadii } from '../fanGeometry';
import { obstaclesOf, type Obstacle } from './obstacles';
import { boxBounds, boxContains } from './voxelize';

const M3S_PER_CFM = 0.000471947;
const MM_PER_M = 1000;
/** Which part heats the air in a cell: `FlowScene.heat` holds one of these. */
export const SOURCE_NONE = 0;
export const SOURCE_GPU = 1;
export const SOURCE_CPU = 2;
/** Share of the ring width kept clear of the hub edge when spawning. */
const SPAWN_HUB_MARGIN = 0.04;
const SAMPLE_SPAWNS = 2048;
const MIN_CASE_CELLS = 4;

/** What a fluid cell on the case shell is: open to the outside through an intake fan, an exhaust fan, or an empty slot. */
export const OPENING_NONE = 0;
export const OPENING_INTAKE = 1;
export const OPENING_EXHAUST = 2;
export const OPENING_VENT = 3;

export interface FlowInput {
  layout: CaseLayout;
  /** Direction of every fan slot, by slot key. */
  directions: Readonly<Record<string, FanDirection>>;
  /** Operating CFM from the lumped model, by model fan key: a slot key, or `slot#i` for the further fans of a radiator. */
  fanCfm: Readonly<Record<string, number>>;
  /** Air leaving (positive) or entering (negative) through the unfanned openings, CFM. */
  ventCfm: number;
  /** Flow of a fan at full speed: fixes the time scale, so a slower fan reads slower instead of the fastest fan always setting the pace. */
  referenceCfm?: number;
}

export interface FlowScene {
  dims: [number, number, number];
  cellMm: number;
  /** Domain mm minus layout mm: where the case's own origin sits in the grid. */
  origin: Vec3;
  /** Case shell cell range, inclusive, per axis. */
  caseMin: [number, number, number];
  caseMax: [number, number, number];
  /** Physical seconds one solver step stands for. */
  stepSeconds: number;
  /** Fastest fan target, cells per step. */
  maxTargetCells: number;
  solid: Uint8Array;
  /** Fixed-pressure cells: the fluid cells on the domain boundary. */
  open: Uint8Array;
  darcy: Float32Array;
  /** Heat source of each cell, by `SOURCE_*`: the part whose temperature warms air passing through it. */
  heat: Float32Array;
  /** Target velocity of fan cells, cells per step, 3 floats per cell. */
  target: Float32Array;
  fanCell: Uint8Array;
  /** Shell cells that are open to the outside, by `OPENING_*`. */
  opening: Uint8Array;
  /**
   * Where intake and inflow particles start: one entry per 12 floats, a fan's ring in cell coordinates (cell centers at integers):
   * center xyz, hub radius, axis xyz, tip radius, first ring axis xyz, outward offset, outward spread (`EMITTER_STRIDE` floats per entry). A case fan on a face starts its particles outside that face: the offset plus a random share of the spread out from the fan plane. A card's fans start just upstream of the card, with no spread. A stronger fan has more entries.
   */
  emitters: Float32Array;
  /** The case's own box in cell coordinates: min then max per axis. */
  caseBounds: { min: Vec3; max: Vec3 };
  /** The case box widened by the outside reach: a particle that leaves it is recycled. */
  particleBounds: { min: Vec3; max: Vec3 };
  /** Emitter entries by fan slot key. */
  emitterCounts: Record<string, number>;
  /** A fixed sample of start points drawn from the emitters (3 floats each), for inspection; the particles draw their own continuously. */
  spawns: Float32Array;
  fanCount: number;
  /** What was rasterized into the solid and porous cells, for the collision view. */
  obstacles: Obstacle[];
}

/** Cell size and counts for roughly `targetCells` cells with the extents' aspect, each axis within the allowed range. */
export function gridFor(extentsMm: Vec3, targetCells: number = GRID_TARGET_CELLS): { dims: [number, number, number]; cellMm: number } {
  const volume = extentsMm[0] * extentsMm[1] * extentsMm[2];
  const cellMm = Math.cbrt(volume / targetCells);
  const axis = (mm: number) => Math.min(MAX_GRID_AXIS, Math.max(MIN_GRID_AXIS, Math.ceil(mm / cellMm)));
  return { dims: [axis(extentsMm[0]), axis(extentsMm[1]), axis(extentsMm[2])], cellMm };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function axisIndex(axis: Vec3): 0 | 1 | 2 {
  const a = [Math.abs(axis[0]), Math.abs(axis[1]), Math.abs(axis[2])];
  return a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
}

/** Unit vector into the case: the slot's own axis, else the box's thinnest side pointing at the case center. */
export function inwardAxis(slot: CaseFanSlot, box: { min: Vec3; size: Vec3 }, extents: Vec3): Vec3 {
  if (slot.axis) return slot.axis;
  const [sx, sy, sz] = box.size;
  const k = sx <= sy && sx <= sz ? 0 : sy <= sz ? 1 : 2;
  const center = box.min[k] + box.size[k] / 2;
  const v: Vec3 = [0, 0, 0];
  v[k] = center <= extents[k] / 2 ? 1 : -1;
  return v;
}

interface Disk {
  center: Vec3;
  axis: Vec3;
  /** Blade tip radius and hub radius, mm: air passes between them. */
  radius: number;
  hub: number;
  /** Side of the fan's square frame, mm. */
  frame: number;
  halfThickness: number;
}

interface PlannedFan {
  disk: Disk;
  direction: FanDirection;
  cfm: number;
  slot: CaseFanSlot;
  porousBox: boolean;
}

interface Plan {
  fans: PlannedFan[];
  /** Radiator slots, whose box is porous. */
  radiators: { box: { min: Vec3; size: Vec3; rotationY?: number } }[];
}

function diskRadii(frame: number): { radius: number; hub: number; frame: number } {
  const r = fanRadii(frame);
  return { radius: r.tip, hub: r.hub, frame };
}

function planFans(input: FlowInput, extents: Vec3, minThickness: number): Plan {
  const { layout } = input;
  const fans: PlannedFan[] = [];
  const radiators: Plan['radiators'] = [];
  const geometry = new Map(fanGeometries(layout).map(g => [g.slot.key, g.box]));
  for (const slot of layout.fanSlots) {
    const direction = input.directions[slot.key] ?? 'intake';
    if (slot.taken === 'radiator') {
      if (slot.box) radiators.push({ box: slot.box });
      continue;
    }
    const box = geometry.get(slot.key);
    if (!box) continue;
    const axis = inwardAxis(slot, box, extents);
    const k = axisIndex(axis);
    const perp = [0, 1, 2].filter(a => a !== k);
    fans.push({
      disk: {
        center: [box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2],
        axis,
        ...diskRadii(Math.min(box.size[perp[0]], box.size[perp[1]])),
        halfThickness: Math.max(box.size[k] / 2, minThickness),
      },
      direction, cfm: slot.taken === 'fan' ? (input.fanCfm[slot.key] ?? 0) : 0, slot, porousBox: false,
    });
  }
  return { fans, radiators };
}

/** Distance in mm from a case fan's centre out to the case face it blows through, or null for a fan that does not sit on a face (a card's fan, or one deeper than a mount reach). */
function faceDistance(f: PlannedFan, extents: Vec3): number | null {
  if (f.slot.position === 'gpu') return null;
  const k = axisIndex(f.disk.axis);
  const lo = f.disk.axis[k] > 0;
  const c = f.disk.center[k];
  const d = lo ? c : extents[k] - c;
  return d - f.disk.halfThickness <= MOUNT_REACH_MM ? d : null;
}

/** Which case faces carry a mount: [lo, hi] per axis. The face is the one the inward axis points away from. */
function mountSides(fans: readonly PlannedFan[], extents: Vec3): [boolean, boolean][] {
  const sides: [boolean, boolean][] = [[false, false], [false, false], [false, false]];
  for (const f of fans) {
    // A card's fans sit inside the case, so they never put outside air on a side.
    if (f.slot.position === 'gpu') continue;
    const k = axisIndex(f.disk.axis);
    const lo = f.disk.axis[k] > 0;
    const c = f.disk.center[k];
    const reach = lo ? c - f.disk.halfThickness : extents[k] - (c + f.disk.halfThickness);
    if (reach <= MOUNT_REACH_MM) sides[k][lo ? 0 : 1] = true;
  }
  return sides;
}

export function buildFlowScene(input: FlowInput, targetCells: number = GRID_TARGET_CELLS): FlowScene {
  const { layout } = input;
  const extents: Vec3 = [layout.size[0], layout.size[2], layout.size[1]];
  const provisional = Math.cbrt((extents[0] * extents[1] * extents[2]) / targetCells);
  const sides = mountSides(planFans(input, extents, provisional).fans, extents);
  const marginMm = (k: number) => (sides[k][0] ? DOMAIN_MARGIN_MM : 0) + (sides[k][1] ? DOMAIN_MARGIN_MM : 0);
  const paddedMm: Vec3 = [extents[0] + marginMm(0), extents[1] + marginMm(1), extents[2] + marginMm(2)];
  const cellMm = Math.cbrt((paddedMm[0] * paddedMm[1] * paddedMm[2]) / targetCells);
  const marginCells = (k: number, hi: 0 | 1) => (sides[k][hi] ? Math.ceil(DOMAIN_MARGIN_MM / cellMm) : 0);
  const caseCells = extents.map(e => Math.max(MIN_CASE_CELLS, Math.ceil(e / cellMm))) as [number, number, number];
  const lo: [number, number, number] = [marginCells(0, 0), marginCells(1, 0), marginCells(2, 0)];
  const dims = [0, 1, 2].map(k => lo[k] + caseCells[k] + marginCells(k, 1)) as [number, number, number];
  const caseMin: [number, number, number] = [lo[0], lo[1], lo[2]];
  const caseMax: [number, number, number] = [lo[0] + caseCells[0] - 1, lo[1] + caseCells[1] - 1, lo[2] + caseCells[2] - 1];
  const origin: Vec3 = [lo[0] * cellMm, lo[1] * cellMm, lo[2] * cellMm];

  const [NX, NY, NZ] = dims;
  const n = NX * NY * NZ;
  const solid = new Uint8Array(n);
  const open = new Uint8Array(n);
  const darcy = new Float32Array(n);
  const heat = new Float32Array(n);
  const target = new Float32Array(n * 3);
  const fanCell = new Uint8Array(n);
  const opening = new Uint8Array(n);
  const id = (i: number, j: number, k: number) => i + NX * (j + NY * k);
  const inCase = (i: number, j: number, k: number) => i >= caseMin[0] && i <= caseMax[0] && j >= caseMin[1] && j <= caseMax[1] && k >= caseMin[2] && k <= caseMax[2];
  const onCaseShell = (i: number, j: number, k: number) => inCase(i, j, k)
    && (i === caseMin[0] || i === caseMax[0] || j === caseMin[1] || j === caseMax[1] || k === caseMin[2] || k === caseMax[2]);

  for (let k = caseMin[2]; k <= caseMax[2]; k++) for (let j = caseMin[1]; j <= caseMax[1]; j++) for (let i = caseMin[0]; i <= caseMax[0]; i++) {
    if (onCaseShell(i, j, k)) solid[id(i, j, k)] = 1;
  }

  const toCell = (mm: number, axis: number) => Math.floor((mm + origin[axis]) / cellMm);
  const eachCellIn = (min: Vec3, max: Vec3, fn: (i: number, j: number, k: number) => void) => {
    const i0 = Math.max(0, toCell(min[0], 0)), i1 = Math.min(NX - 1, toCell(max[0], 0));
    const j0 = Math.max(0, toCell(min[1], 1)), j1 = Math.min(NY - 1, toCell(max[1], 1));
    const k0 = Math.max(0, toCell(min[2], 2)), k1 = Math.min(NZ - 1, toCell(max[2], 2));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, k);
  };
  const layoutMm = (i: number, j: number, k: number): Vec3 => [(i + 0.5) * cellMm - origin[0], (j + 0.5) * cellMm - origin[1], (k + 0.5) * cellMm - origin[2]];

  /** Solid parts whose neighboring fluid cells are heat cells: [cell, source]. */
  const sources: [number, number][] = [];
  // `touching` takes every cell the shape touches, so a particle in a fluid cell is never inside the shape.
  const voxelize = (box: CaseBox, fn: (c: number) => void, touching = false) => {
    const b = boxBounds(box, cellMm);
    const half = cellMm / 2;
    eachCellIn(b.min, b.max, (i, j, k) => {
      if (!inCase(i, j, k) || onCaseShell(i, j, k)) return;
      const c = layoutMm(i, j, k);
      const hit = touching
        ? [-half, half].some(dx => [-half, half].some(dy => [-half, half].some(dz => boxContains(box, [c[0] + dx, c[1] + dy, c[2] + dz], cellMm))))
        : boxContains(box, c, cellMm);
      if (hit) fn(id(i, j, k));
    });
  };
  /** Cells outside the case's real shape: solid, and no fan opens them. */
  const outside = new Uint8Array(n);
  const obstacles = obstaclesOf(layout);
  // An AIO dumps the CPU's heat at its radiator, an air cooler at its own fins; with neither, the CPU box itself is the source.
  const cpuOnRadiator = layout.fanSlots.some(s => s.taken === 'radiator' && s.box);
  const hasCooler = obstacles.some(o => o.porous && o.box.slot === 'cooler');
  for (const o of obstacles) {
    if (o.kind === 'hull') {
      voxelize(o.box, c => { solid[c] = 1; outside[c] = 1; }, true);
    } else if (o.porous) {
      const heats = o.box.slot === 'cooler' && !cpuOnRadiator;
      voxelize(o.box, c => { darcy[c] = DARCY_K; if (heats) heat[c] = SOURCE_CPU; });
    } else {
      const source = o.box.slot === 'gpu' ? SOURCE_GPU : o.box.slot === 'cpu' && !cpuOnRadiator && !hasCooler ? SOURCE_CPU : SOURCE_NONE;
      voxelize(o.box, c => { solid[c] = 1; if (source !== SOURCE_NONE) sources.push([c, source]); });
    }
  }

  const plan = planFans(input, extents, cellMm * MIN_FAN_HALF_THICKNESS_CELLS);
  for (const r of plan.radiators) {
    voxelize({ slot: 'radiator', role: 'part', min: r.box.min, size: r.box.size, rotationY: r.box.rotationY }, c => { if (!solid[c]) { darcy[c] = DARCY_K; heat[c] = SOURCE_CPU; } });
  }

  // A fan's disc is never walled in: structure plates and collision solids within its thickness plus the clearance, on both sides, open up across the disc. The hull cut and the case shell stay.
  for (const p of plan.fans) {
    // A stopped card fan leaves the card's heatsink shut, as before.
    if (p.slot.taken === null || (p.slot.position === 'gpu' && p.cfm <= 0)) continue;
    const { center, axis, radius, halfThickness } = p.disk;
    const span = halfThickness + FAN_CLEARANCE_MM;
    const reach = Math.hypot(radius, span);
    eachCellIn(sub(center, [reach, reach, reach]), add(center, [reach, reach, reach]), (i, j, k) => {
      const c = id(i, j, k);
      if (!solid[c] || outside[c] || onCaseShell(i, j, k) || !inCase(i, j, k)) return;
      const d = sub(layoutMm(i, j, k), center);
      const along = dot(d, axis);
      if (Math.abs(along) > span) return;
      if (Math.hypot(d[0] - axis[0] * along, d[1] - axis[1] * along, d[2] - axis[2] * along) > radius) return;
      solid[c] = 0;
    });
  }

  interface FanCells { annulus: number[]; blocked: number[]; layers: number; perLayer: number }
  const e1Of = (axis: Vec3) => norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const SUB = 3;
  const hubOf = (p: PlannedFan) => (p.slot.taken === null ? 0 : p.disk.hub);

  // The open ring of a fan: cells whose area is mostly between hub and tip carry the air; the hub and the square frame around it are solid.
  const classify = (p: PlannedFan): FanCells => {
    const { center, axis, radius, frame, halfThickness } = p.disk;
    // An empty slot is a bare grille: open across the whole disc, no hub, no frame.
    const hub = hubOf(p);
    const e1 = e1Of(axis);
    const e2 = cross(axis, e1);
    const k = axisIndex(axis);
    const lat = [0, 1, 2].filter(a => a !== k);
    // The face this fan points out through: the min side when the axis points inward from it, else the max side.
    const onOwnFace = (index: number) => index === (axis[k] > 0 ? caseMin[k] : caseMax[k]);
    const reach = frame / 2 + cellMm * 2;
    const annulus: number[] = [];
    const blocked: number[] = [];
    const layers = new Set<number>();
    eachCellIn(sub(center, [reach, reach, reach]), add(center, [reach, reach, reach]), (i, j, kk) => {
      if (!inCase(i, j, kk)) return;
      const cc = layoutMm(i, j, kk);
      const d0 = sub(cc, center);
      const along = dot(d0, axis);
      // A fan within reach of a face vents through that face across its footprint, however far the panel sits from the mount; a perpendicular panel it touches stays shut.
      const shell = onCaseShell(i, j, kk);
      if (shell && !onOwnFace([i, j, kk][k])) return;
      if (Math.abs(along) > halfThickness + (shell ? Math.max(MOUNT_REACH_MM, cellMm * 1.5) : 0)) return;
      let inRing = 0;
      let inFrame = 0;
      for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
        const d: Vec3 = [d0[0], d0[1], d0[2]];
        d[lat[0]] += ((a + 0.5) / SUB - 0.5) * cellMm;
        d[lat[1]] += ((b + 0.5) / SUB - 0.5) * cellMm;
        const u = dot(d, e1), v = dot(d, e2);
        if (Math.abs(u) > frame / 2 || Math.abs(v) > frame / 2) continue;
        inFrame++;
        const r = Math.hypot(u, v);
        if (r > hub && r <= radius) inRing++;
      }
      if (inFrame === 0) return;
      const id3 = id(i, j, kk);
      if (outside[id3]) return;
      if (inRing / (SUB * SUB) >= 0.4) {
        annulus.push(id3);
        layers.add([i, j, kk][k]);
      } else if (!p.porousBox && p.slot.taken !== null) blocked.push(id3);
    });
    return { annulus, blocked, layers: layers.size, perLayer: layers.size > 0 ? annulus.length / layers.size : 0 };
  };

  const cellsOf = plan.fans.map(p => (p.cfm > 0 || (!p.porousBox && p.slot.position !== 'gpu') ? classify(p) : { annulus: [], blocked: [], layers: 0, perLayer: 0 }));
  const cellAreaM2 = (cellMm / MM_PER_M) ** 2;
  // Air speed through the ring: the fan's flow over the area its ring cells cover, so a coarse grid still moves the fan's CFM.
  const velocityMps = (p: PlannedFan, c: FanCells) => (c.perLayer > 0 && p.cfm > 0 ? (p.cfm * M3S_PER_CFM) / (c.perLayer * cellAreaM2) : 0);
  const referenceOf = (p: PlannedFan, c: FanCells) => (input.referenceCfm && c.perLayer > 0 ? (input.referenceCfm * M3S_PER_CFM) / (c.perLayer * cellAreaM2) : velocityMps(p, c));
  const reference = Math.max(MIN_REFERENCE_SPEED, ...plan.fans.map((p, i) => referenceOf(p, cellsOf[i])));
  const stepSeconds = (CFL_TARGET * (cellMm / MM_PER_M)) / reference;

  // Particles start strictly outside the hub: a margin past its edge, so none sits on the core circle.
  const spawnHub = (p: PlannedFan) => (hubOf(p) > 0 ? hubOf(p) + SPAWN_HUB_MARGIN * (p.disk.radius - hubOf(p)) : 0);
  const emitters: number[] = [];
  const emitterCounts: Record<string, number> = {};
  const pending: { p: PlannedFan; entries: number }[] = [];
  const addSpawns = (p: PlannedFan, weight: number) => {
    // Entries follow the fan's flow within a floor and a cap, so a near-stopped fan emits next to nothing but a spinning one never none.
    pending.push({ p, entries: Math.min(MAX_EMITTERS_PER_FAN, Math.max(MIN_EMITTERS_PER_FAN, Math.round((weight / 60) * EMITTERS_PER_60_CFM))) });
  };
  const flushSpawns = () => {
    const total = pending.reduce((sum, q) => sum + q.entries, 0);
    const share = total > MAX_EMITTER_ENTRIES ? MAX_EMITTER_ENTRIES / total : 1;
    for (const { p, entries: wanted } of pending) {
      const entries = Math.max(1, Math.floor(wanted * share));
      const e1 = e1Of(p.disk.axis);
      const c = [0, 1, 2].map(a => (p.disk.center[a] + origin[a]) / cellMm - 0.5);
      const face = faceDistance(p, extents);
      // On a face the particles start outside it: from a share of the reach out to a larger one, measured from the face.
      const back = p.slot.position === 'gpu' ? p.disk.halfThickness / cellMm + 1 : face === null ? 0 : (face + OUTSIDE_SPAWN_FROM * OUTSIDE_REACH_MM) / cellMm;
      const span = face === null ? 0 : ((OUTSIDE_SPAWN_TO - OUTSIDE_SPAWN_FROM) * OUTSIDE_REACH_MM) / cellMm;
      for (let m = 0; m < entries; m++) {
        emitters.push(c[0], c[1], c[2], spawnHub(p) / cellMm, p.disk.axis[0], p.disk.axis[1], p.disk.axis[2], p.disk.radius / cellMm, e1[0], e1[1], e1[2], back, span, 0, 0, 0);
      }
      emitterCounts[p.slot.key] = (emitterCounts[p.slot.key] ?? 0) + entries;
    }
  };

  // Frames and hubs first: a neighbor's frame must not close another fan's open ring where their cells meet.
  for (const cells of cellsOf) for (const c of cells.blocked) solid[c] = 1;
  let fanCount = 0;
  let maxTarget = 0;
  plan.fans.forEach((p, n) => {
    const cells = cellsOf[n];
    const { axis } = p.disk;
    const mps = velocityMps(p, cells);
    const speed = mps > 0 ? (CFL_TARGET * mps) / reference : 0;
    maxTarget = Math.max(maxTarget, speed);
    const sign = p.direction === 'intake' ? 1 : -1;
    const vel = scale(axis, sign * speed);
    const kind = speed > 0 ? (p.direction === 'intake' ? OPENING_INTAKE : OPENING_EXHAUST) : p.porousBox ? OPENING_NONE : OPENING_VENT;
    for (const c of cells.annulus) {
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      solid[c] = 0;
      if (onCaseShell(i, j, k) && kind !== OPENING_NONE) opening[c] = kind;
      if (speed > 0 && !solid[c]) {
        target[c * 3] = vel[0]; target[c * 3 + 1] = vel[1]; target[c * 3 + 2] = vel[2];
        fanCell[c] = 1;
      }
    }
    // The fan's force carries on outside its face for the reach, so the air out there follows the fan: drawn in for an intake, pushed out for an exhaust.
    if (speed > 0 && faceDistance(p, extents) !== null) {
      const k = axisIndex(axis);
      const outward = axis[k] > 0 ? -1 : 1;
      const stride = [1, NX, NX * NY][k];
      const dim = dims[k];
      const reachCells = Math.ceil(OUTSIDE_REACH_MM / cellMm);
      for (const c of cells.annulus) {
        const ijk = [c % NX, Math.floor(c / NX) % NY, Math.floor(c / (NX * NY))];
        if (!onCaseShell(ijk[0], ijk[1], ijk[2]) || ijk[k] !== (axis[k] > 0 ? caseMin[k] : caseMax[k])) continue;
        for (let n = 1; n <= reachCells; n++) {
          const idx = ijk[k] + outward * n;
          if (idx < 1 || idx > dim - 2) break;
          const o = c + outward * n * stride;
          if (solid[o] || outside[o]) break;
          target[o * 3] = vel[0]; target[o * 3 + 1] = vel[1]; target[o * 3 + 2] = vel[2];
          fanCell[o] = 1;
        }
      }
    }
    if (speed > 0) {
      fanCount++;
      if (p.direction === 'intake') addSpawns(p, p.cfm);
    } else if (!p.porousBox && p.slot.position !== 'gpu' && input.ventCfm < 0) {
      addSpawns(p, Math.abs(input.ventCfm) / 4);
    }
  });

  flushSpawns();

  // Heat: fluid cells within reach of a heat-source solid warm the air that passes.
  for (const [c, source] of sources) {
    const ci = c % NX, cj = Math.floor(c / NX) % NY, ck = Math.floor(c / (NX * NY));
    for (let dk = -HEAT_REACH_CELLS; dk <= HEAT_REACH_CELLS; dk++) for (let dj = -HEAT_REACH_CELLS; dj <= HEAT_REACH_CELLS; dj++) for (let di = -HEAT_REACH_CELLS; di <= HEAT_REACH_CELLS; di++) {
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
      const m = id(i, j, k);
      if (!solid[m] && heat[m] === SOURCE_NONE) heat[m] = source;
    }
  }

  // The domain's own boundary is open air: fixed pressure wherever it is not a solid wall.
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if ((i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) && !solid[id(i, j, k)]) open[id(i, j, k)] = 1;
  }

  const caseBounds = { min: [0, 1, 2].map(a => origin[a] / cellMm - 0.5) as Vec3, max: [0, 1, 2].map(a => (extents[a] + origin[a]) / cellMm - 0.5) as Vec3 };
  const result: FlowScene = { dims, cellMm, origin, caseMin, caseMax, stepSeconds, maxTargetCells: maxTarget, solid, open, darcy, heat, target, fanCell, opening, obstacles, emitters: new Float32Array(emitters), emitterCounts, caseBounds, particleBounds: { min: caseBounds.min.map(v => v - OUTSIDE_REACH_MM / cellMm) as Vec3, max: caseBounds.max.map(v => v + OUTSIDE_REACH_MM / cellMm) as Vec3 }, spawns: new Float32Array(0), fanCount };
  const scene: FlowScene = result;
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples: number[] = [];
  for (let m = 0; m < SAMPLE_SPAWNS && emitters.length > 0; m++) {
    const q = sampleSpawn(scene, rnd);
    if (q) samples.push(q[0], q[1], q[2]);
  }
  scene.spawns = new Float32Array(samples);
  return scene;
}

/** Whether the cell holding layout-mm point `p` is solid; outside the domain counts as solid. */
export function isSolidAt(scene: FlowScene, p: Vec3): boolean {
  const [NX, NY, NZ] = scene.dims;
  const i = Math.floor((p[0] + scene.origin[0]) / scene.cellMm);
  const j = Math.floor((p[1] + scene.origin[1]) / scene.cellMm);
  const k = Math.floor((p[2] + scene.origin[2]) / scene.cellMm);
  if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return true;
  return scene.solid[i + NX * (j + NY * k)] === 1;
}

/** A start point, in cell coordinates, drawn from the scene's emitters: an entry at random, then a point area-uniform over its ring between hub and tip, set outward of the fan, and for a case fan on a face out past it. Null after a few tries that land in a solid. */
export function sampleSpawn(scene: FlowScene, rnd: () => number): Vec3 | null {
  const n = scene.emitters.length / EMITTER_STRIDE;
  if (n === 0) return null;
  const [NX, NY, NZ] = scene.dims;
  for (let t = 0; t < SPAWN_TRIES; t++) {
    const o = Math.min(n - 1, Math.floor(rnd() * n)) * EMITTER_STRIDE;
    const e = scene.emitters;
    const hub = e[o + 3], tip = e[o + 7];
    const r = Math.sqrt(hub * hub + (tip * tip - hub * hub) * rnd());
    const th = 2 * Math.PI * rnd();
    const back = e[o + 11] + e[o + 12] * rnd();
    const axis: Vec3 = [e[o + 4], e[o + 5], e[o + 6]];
    const e1: Vec3 = [e[o + 8], e[o + 9], e[o + 10]];
    const e2 = cross(axis, e1);
    const pos: Vec3 = [0, 1, 2].map(a => e[o + a] + e1[a] * r * Math.cos(th) + e2[a] * r * Math.sin(th) - axis[a] * back) as Vec3;
    const i = Math.floor(pos[0] + 0.5), j = Math.floor(pos[1] + 0.5), k = Math.floor(pos[2] + 0.5);
    if (i < 1 || j < 1 || k < 1 || i >= NX - 1 || j >= NY - 1 || k >= NZ - 1 || scene.solid[i + NX * (j + NY * k)]) continue;
    return pos;
  }
  return null;
}
