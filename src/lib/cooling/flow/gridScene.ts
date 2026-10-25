import { fanGeometries, type CaseBox, type CaseFanSlot, type CaseLayout, type Vec3 } from '../caseLayout';
import type { FanDirection } from '../pressureModel';
import {
  CFL_TARGET, DARCY_K, DOMAIN_MARGIN_MM, GRID_TARGET_CELLS, HEAT_RATE_NEAR, HEAT_RATE_POROUS, HEAT_REACH_CELLS, MAX_GRID_AXIS, MAX_SPAWN_POINTS,
  MIN_FAN_HALF_THICKNESS_CELLS, MIN_GRID_AXIS, MIN_REFERENCE_SPEED, MOUNT_REACH_MM,
} from './flowParams';
import { boxBounds, boxContains } from './voxelize';

const M3S_PER_CFM = 0.000471947;
const MM_PER_M = 1000;
const SOLID_PARTS = new Set(['gpu', 'psu', 'motherboard', 'storage', 'ram', 'cpu']);
const POROUS_PARTS = new Set(['cooler']);
const HEAT_PARTS = new Set(['gpu', 'psu', 'cpu']);
const GOLDEN_ANGLE = 2.399963;
const SPAWN_PER_60_CFM = 64;
const MIN_SPAWN_PER_FAN = 8;
const MAX_SPAWN_PER_FAN = 512;
const SPAWN_OUTSIDE_CELLS = 1.5;
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
  /** Heat a particle gains per step in each cell. */
  heat: Float32Array;
  /** Target velocity of fan cells, cells per step, 3 floats per cell. */
  target: Float32Array;
  fanCell: Uint8Array;
  /** Shell cells that are open to the outside, by `OPENING_*`. */
  opening: Uint8Array;
  /** Where intake and inflow particles start, in cell coordinates (cell centres at integers); 3 floats each. */
  spawns: Float32Array;
  fanCount: number;
  /** Steps a parcel of air takes to cross the case at the nominal through-flow: case volume over intake flow, in solver steps. 0 when nothing draws air in. */
  residenceSteps: number;
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

/** Unit vector into the case: the slot's own axis, else the box's thinnest side pointing at the case centre. */
export function inwardAxis(slot: CaseFanSlot, box: { min: Vec3; size: Vec3 }, extents: Vec3): Vec3 {
  if (slot.axis) return slot.axis;
  const [sx, sy, sz] = box.size;
  const k = sx <= sy && sx <= sz ? 0 : sy <= sz ? 1 : 2;
  const centre = box.min[k] + box.size[k] / 2;
  const v: Vec3 = [0, 0, 0];
  v[k] = centre <= extents[k] / 2 ? 1 : -1;
  return v;
}

interface Disk {
  centre: Vec3;
  axis: Vec3;
  radius: number;
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

function planFans(input: FlowInput, extents: Vec3, minThickness: number): Plan {
  const { layout } = input;
  const fans: PlannedFan[] = [];
  const radiators: Plan['radiators'] = [];
  const geometry = new Map(fanGeometries(layout).map(g => [g.slot.key, g.box]));
  for (const slot of layout.fanSlots) {
    const direction = input.directions[slot.key] ?? 'intake';
    if (slot.taken === 'radiator') {
      const box = slot.box;
      if (!box) continue;
      radiators.push({ box });
      const axis = inwardAxis(slot, box, extents);
      const k = axisIndex(axis);
      const perp = [0, 1, 2].filter(a => a !== k);
      const count = 1 + Object.keys(input.fanCfm).filter(key => key.startsWith(`${slot.key}#`)).length;
      const longAxis = box.size[perp[0]] >= box.size[perp[1]] ? perp[0] : perp[1];
      const shortSide = box.size[perp[0] === longAxis ? perp[1] : perp[0]];
      for (let f = 0; f < count; f++) {
        const centre: Vec3 = [box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2];
        centre[longAxis] = box.min[longAxis] + (box.size[longAxis] * (f + 0.5)) / count;
        fans.push({
          disk: { centre, axis, radius: Math.min(shortSide, box.size[longAxis] / count) * 0.47, halfThickness: Math.max(box.size[k] / 2, minThickness) },
          direction, cfm: input.fanCfm[f === 0 ? slot.key : `${slot.key}#${f}`] ?? 0, slot, porousBox: true,
        });
      }
      continue;
    }
    const box = geometry.get(slot.key);
    if (!box) continue;
    const axis = inwardAxis(slot, box, extents);
    const k = axisIndex(axis);
    const perp = [0, 1, 2].filter(a => a !== k);
    fans.push({
      disk: {
        centre: [box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2],
        axis,
        radius: Math.min(box.size[perp[0]], box.size[perp[1]]) * 0.47,
        halfThickness: Math.max(box.size[k] / 2, minThickness),
      },
      direction, cfm: slot.taken === 'fan' ? (input.fanCfm[slot.key] ?? 0) : 0, slot, porousBox: false,
    });
  }
  return { fans, radiators };
}

/** Which case faces carry a mount: [lo, hi] per axis. The face is the one the inward axis points away from. */
function mountSides(fans: readonly PlannedFan[], extents: Vec3): [boolean, boolean][] {
  const sides: [boolean, boolean][] = [[false, false], [false, false], [false, false]];
  for (const f of fans) {
    const k = axisIndex(f.disk.axis);
    const lo = f.disk.axis[k] > 0;
    const c = f.disk.centre[k];
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

  const sources: number[] = [];
  const voxelize = (box: CaseBox, fn: (c: number) => void) => {
    const b = boxBounds(box, cellMm);
    eachCellIn(b.min, b.max, (i, j, k) => {
      if (!inCase(i, j, k) || onCaseShell(i, j, k)) return;
      if (boxContains(box, layoutMm(i, j, k), cellMm)) fn(id(i, j, k));
    });
  };
  for (const box of layout.boxes) {
    if (box.role === 'ghost' || box.role === 'limit' || box.role === 'glass' || box.role === 'detail') continue;
    if (POROUS_PARTS.has(box.slot)) {
      voxelize(box, c => { darcy[c] = DARCY_K; heat[c] = HEAT_RATE_POROUS; });
    } else if (SOLID_PARTS.has(box.slot)) {
      const isHeat = HEAT_PARTS.has(box.slot);
      voxelize(box, c => { solid[c] = 1; if (isHeat) sources.push(c); });
    }
  }

  const plan = planFans(input, extents, cellMm * MIN_FAN_HALF_THICKNESS_CELLS);
  for (const r of plan.radiators) {
    voxelize({ slot: 'radiator', role: 'part', min: r.box.min, size: r.box.size, rotationY: r.box.rotationY }, c => { if (!solid[c]) { darcy[c] = DARCY_K; heat[c] = HEAT_RATE_POROUS; } });
  }

  const velocityMps = (p: PlannedFan) => {
    const radiusM = p.disk.radius / MM_PER_M;
    return (p.cfm * M3S_PER_CFM) / (Math.PI * radiusM * radiusM);
  };
  const reference = Math.max(MIN_REFERENCE_SPEED, ...plan.fans.map(velocityMps));
  const stepSeconds = (CFL_TARGET * (cellMm / MM_PER_M)) / reference;

  const spawns: number[] = [];
  const addSpawns = (p: PlannedFan, weight: number) => {
    const count = Math.min(MAX_SPAWN_PER_FAN, Math.max(MIN_SPAWN_PER_FAN, Math.round((weight / 60) * SPAWN_PER_60_CFM)));
    const e1 = norm(cross(p.disk.axis, Math.abs(p.disk.axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const e2 = cross(p.disk.axis, e1);
    for (let m = 0; m < count && spawns.length / 3 < MAX_SPAWN_POINTS; m++) {
      const r = p.disk.radius * 0.9 * Math.sqrt((m + 0.5) / count);
      const th = m * GOLDEN_ANGLE;
      const back = p.disk.halfThickness + cellMm * (SPAWN_OUTSIDE_CELLS + ((m * 0.37) % 3));
      const pos = add(add(add(p.disk.centre, scale(e1, r * Math.cos(th))), scale(e2, r * Math.sin(th))), scale(p.disk.axis, -back));
      const ci = Math.floor((pos[0] + origin[0]) / cellMm), cj = Math.floor((pos[1] + origin[1]) / cellMm), ck = Math.floor((pos[2] + origin[2]) / cellMm);
      if (ci < 1 || cj < 1 || ck < 1 || ci >= NX - 1 || cj >= NY - 1 || ck >= NZ - 1 || solid[id(ci, cj, ck)]) continue;
      spawns.push((pos[0] + origin[0]) / cellMm - 0.5, (pos[1] + origin[1]) / cellMm - 0.5, (pos[2] + origin[2]) / cellMm - 0.5);
    }
  };

  let fanCount = 0;
  let maxTarget = 0;
  let intakeCfm = 0;
  for (const p of plan.fans) {
    const { centre, axis, radius, halfThickness } = p.disk;
    const speed = p.cfm > 0 ? (CFL_TARGET * velocityMps(p)) / reference : 0;
    maxTarget = Math.max(maxTarget, speed);
    const sign = p.direction === 'intake' ? 1 : -1;
    const vel = scale(axis, sign * speed);
    const reach = radius + cellMm * 2;
    const kind = speed > 0 ? (p.direction === 'intake' ? OPENING_INTAKE : OPENING_EXHAUST) : p.porousBox ? OPENING_NONE : OPENING_VENT;
    eachCellIn(sub(centre, [reach, reach, reach]), add(centre, [reach, reach, reach]), (i, j, k) => {
      const d = sub(layoutMm(i, j, k), centre);
      const along = dot(d, axis);
      const perp = Math.hypot(...(sub(d, scale(axis, along))));
      if (perp > radius) return;
      const c = id(i, j, k);
      if (onCaseShell(i, j, k) && Math.abs(along) <= halfThickness + cellMm * 1.5) {
        solid[c] = 0;
        if (kind !== OPENING_NONE) opening[c] = kind;
      }
      if (Math.abs(along) <= halfThickness && speed > 0 && !solid[c]) {
        target[c * 3] = vel[0]; target[c * 3 + 1] = vel[1]; target[c * 3 + 2] = vel[2];
        fanCell[c] = 1;
      }
    });
    if (speed > 0) {
      fanCount++;
      if (p.direction === 'intake') { addSpawns(p, p.cfm); intakeCfm += p.cfm; }
    } else if (p.slot.taken === null && !p.porousBox && input.ventCfm < 0) {
      addSpawns(p, Math.abs(input.ventCfm) / 4);
    }
  }

  // Heat: fluid cells within reach of a heat-source solid warm the air that passes.
  for (const c of sources) {
    const ci = c % NX, cj = Math.floor(c / NX) % NY, ck = Math.floor(c / (NX * NY));
    for (let dk = -HEAT_REACH_CELLS; dk <= HEAT_REACH_CELLS; dk++) for (let dj = -HEAT_REACH_CELLS; dj <= HEAT_REACH_CELLS; dj++) for (let di = -HEAT_REACH_CELLS; di <= HEAT_REACH_CELLS; di++) {
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
      const m = id(i, j, k);
      if (!solid[m] && heat[m] < HEAT_RATE_NEAR) heat[m] = HEAT_RATE_NEAR;
    }
  }

  // The domain's own boundary is open air: fixed pressure wherever it is not a solid wall.
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if ((i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) && !solid[id(i, j, k)]) open[id(i, j, k)] = 1;
  }

  const caseM3 = (extents[0] * extents[1] * extents[2]) / (MM_PER_M ** 3);
  const residenceSteps = intakeCfm > 0 ? caseM3 / (intakeCfm * M3S_PER_CFM) / stepSeconds : 0;
  return { residenceSteps, dims, cellMm, origin, caseMin, caseMax, stepSeconds, maxTargetCells: maxTarget, solid, open, darcy, heat, target, fanCell, opening, spawns: new Float32Array(spawns), fanCount };
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

/** Cell centres, in layout mm, of the solid cells that form the parts' surface (solid with a fluid neighbour), the case shell left out. */
export function surfaceSolids(scene: FlowScene): Float32Array {
  const [NX, NY, NZ] = scene.dims;
  const out: number[] = [];
  const { caseMin, caseMax, solid, cellMm, origin } = scene;
  for (let k = caseMin[2] + 1; k < caseMax[2]; k++) for (let j = caseMin[1] + 1; j < caseMax[1]; j++) for (let i = caseMin[0] + 1; i < caseMax[0]; i++) {
    const c = i + NX * (j + NY * k);
    if (!solid[c]) continue;
    if (!solid[c - 1] || !solid[c + 1] || !solid[c - NX] || !solid[c + NX] || !solid[c - NX * NY] || !solid[c + NX * NY]) {
      out.push((i + 0.5) * cellMm - origin[0], (j + 0.5) * cellMm - origin[1], (k + 0.5) * cellMm - origin[2]);
    }
  }
  void NZ;
  return new Float32Array(out);
}
