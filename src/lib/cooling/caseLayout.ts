import type { FanDirection } from './pressureModel';

/** Read-only view of the PcLayout nexus-build writes as `resolved.caseLayout`. Millimeters; x front to rear, y up, z from the window side. */
export type Vec3 = [number, number, number];

export interface CaseChamfer {
  a: 0 | 1 | 2;
  aMax: boolean;
  b: 0 | 1 | 2;
  bMax: boolean;
  legA: number;
  legB: number;
  round?: boolean;
}

/** Outline [x, z] at one height of a lofted part; every ring of a part has the same vertex count. */
export interface CaseRing {
  y: number;
  pts: [number, number][];
}

export interface CasePlate {
  normal: 0 | 1 | 2;
  outline: [number, number][];
  holes: [number, number][][];
  wall?: boolean;
}

export interface CaseBox {
  slot: string;
  role: string;
  min: Vec3;
  size: Vec3;
  select?: string;
  rotationY?: number;
  fans?: { axis: 'x' | 'y' | 'z'; diameter: number };
  chamfers?: CaseChamfer[];
  rings?: CaseRing[];
  /** A closed solid: planar polygons of [x, y, z] points. */
  faces?: Vec3[][];
  plate?: CasePlate;
}

export interface SlotFanSpec {
  title?: string;
  rpmMax?: number;
  airflowCfm?: number;
  staticPressureMmH2O?: number;
}

export interface SlotRadiatorSpec {
  title?: string;
  fanRpmMax?: number;
  fanAirflowCfm?: number;
  fanStaticPressureMmH2O?: number;
  fanCount?: number;
}

export interface CaseFanSlot {
  key: string;
  position: string;
  size: number;
  index: number;
  taken: 'fan' | 'radiator' | null;
  /** Fan footprint in layout mm; present on newer records for every slot. */
  box?: { min: Vec3; size: Vec3; rotationY?: number };
  /** Unit vector into the case: intake moves air along it, exhaust against it. */
  axis?: Vec3;
  fan?: SlotFanSpec;
  radiator?: SlotRadiatorSpec;
}

export interface CaseLayout {
  /** Outer case [depth, width, height]; box sizes are [depth, height, width]. */
  size: Vec3;
  boxes: CaseBox[];
  fanSlots: CaseFanSlot[];
  /** The glass is on the right as seen from the front; Build's exported model mirrors x for it. */
  windowRight?: boolean;
  /** The case's name as Build resolved it, when the maker's own documents describe the interior. */
  caseModel?: string;
}

const MAX_DIM_MM = 3000;
const MAX_BOXES = 600;
const MAX_SLOTS = 128;
const MAX_KEY = 128;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function vec3(v: unknown, positive: boolean): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return null;
  if (positive ? v.some(n => n <= 0 || n > MAX_DIM_MM) : v.some(n => Math.abs(n) > MAX_DIM_MM)) return null;
  return [v[0], v[1], v[2]];
}

const keyOf = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_KEY;

const MAX_POLY_POINTS = 512;
const MAX_FACES = 400;
const MAX_RINGS = 64;

function poly2(v: unknown): [number, number][] | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > MAX_POLY_POINTS) return null;
  const out: [number, number][] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > MAX_DIM_MM || Math.abs(p[1]) > MAX_DIM_MM) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

function parseShapes(b: Record<string, unknown>, box: CaseBox) {
  if (Array.isArray(b.chamfers)) {
    const cuts: CaseChamfer[] = [];
    for (const c of b.chamfers.slice(0, 16) as Record<string, unknown>[]) {
      const axis = (v: unknown): v is 0 | 1 | 2 => v === 0 || v === 1 || v === 2;
      if (c && axis(c.a) && axis(c.b) && c.a !== c.b && finite(c.legA) && finite(c.legB) && c.legA > 0 && c.legB > 0) {
        cuts.push({ a: c.a, aMax: c.aMax === true, b: c.b, bMax: c.bMax === true, legA: c.legA, legB: c.legB, round: c.round === true });
      }
    }
    if (cuts.length) box.chamfers = cuts;
  }
  if (Array.isArray(b.rings) && b.rings.length >= 2 && b.rings.length <= MAX_RINGS) {
    const rings: CaseRing[] = [];
    for (const r of b.rings as Record<string, unknown>[]) {
      const pts = r && finite(r.y) ? poly2(r.pts) : null;
      if (pts) rings.push({ y: r.y as number, pts });
    }
    const n = rings[0]?.pts.length;
    if (rings.length === b.rings.length && rings.every(r => r.pts.length === n)) box.rings = rings;
  }
  if (Array.isArray(b.faces) && b.faces.length > 0 && b.faces.length <= MAX_FACES) {
    const faces: Vec3[][] = [];
    for (const f of b.faces) {
      if (!Array.isArray(f) || f.length < 3 || f.length > MAX_POLY_POINTS) continue;
      const pts = f.map(p => vec3(p, false));
      if (pts.every((p): p is Vec3 => p !== null)) faces.push(pts);
    }
    if (faces.length >= 4) box.faces = faces;
  }
  const pl = b.plate as Record<string, unknown> | undefined;
  if (pl && typeof pl === 'object' && (pl.normal === 0 || pl.normal === 1 || pl.normal === 2)) {
    const outline = poly2(pl.outline);
    if (outline) {
      const holes = Array.isArray(pl.holes) ? pl.holes.slice(0, 64).map(poly2).filter((h): h is [number, number][] => h !== null) : [];
      box.plate = { normal: pl.normal, outline, holes, ...(pl.wall === true ? { wall: true } : {}) };
    }
  }
}

function parseBox(raw: unknown): CaseBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const min = vec3(b.min, false);
  const size = vec3(b.size, false);
  if (!min || !size || size.some(n => n < 0) || typeof b.slot !== 'string' || typeof b.role !== 'string') return null;
  const box: CaseBox = { slot: b.slot, role: b.role, min, size };
  if (keyOf(b.select)) box.select = b.select;
  if (finite(b.rotationY)) box.rotationY = b.rotationY;
  const fans = b.fans as Record<string, unknown> | undefined;
  if (fans && (fans.axis === 'x' || fans.axis === 'y' || fans.axis === 'z') && finite(fans.diameter) && fans.diameter > 0) {
    box.fans = { axis: fans.axis, diameter: fans.diameter };
  }
  parseShapes(b, box);
  return box;
}

const positiveNum = (v: unknown): number | undefined => (finite(v) && v > 0 ? v : undefined);
const titleOf = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 200 ? v : undefined);

function unitAxis(v: unknown): Vec3 | undefined {
  const a = vec3(v, false);
  if (!a) return undefined;
  const len = Math.hypot(a[0], a[1], a[2]);
  return len > 0.01 ? [a[0] / len, a[1] / len, a[2] / len] : undefined;
}

function parseSlot(raw: unknown): CaseFanSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!keyOf(s.key) || typeof s.position !== 'string' || !finite(s.size) || !finite(s.index)) return null;
  const taken = s.taken === 'fan' || s.taken === 'radiator' ? s.taken : null;
  const slot: CaseFanSlot = { key: s.key, position: s.position, size: s.size, index: s.index, taken };
  const b = s.box as Record<string, unknown> | undefined;
  const bMin = b ? vec3(b.min, false) : null;
  const bSize = b ? vec3(b.size, false) : null;
  if (b && bMin && bSize && bSize.every(n => n >= 0)) slot.box = { min: bMin, size: bSize, ...(finite(b.rotationY) ? { rotationY: b.rotationY } : {}) };
  const axis = unitAxis(s.axis);
  if (axis) slot.axis = axis;
  const f = s.fan as Record<string, unknown> | undefined;
  if (f && typeof f === 'object') slot.fan = { title: titleOf(f.title), rpmMax: positiveNum(f.rpmMax), airflowCfm: positiveNum(f.airflowCfm), staticPressureMmH2O: positiveNum(f.staticPressureMmH2O) };
  const r = s.radiator as Record<string, unknown> | undefined;
  if (r && typeof r === 'object') {
    slot.radiator = {
      title: titleOf(r.title),
      fanRpmMax: positiveNum(r.fanRpmMax),
      fanAirflowCfm: positiveNum(r.fanAirflowCfm),
      fanStaticPressureMmH2O: positiveNum(r.fanStaticPressureMmH2O),
      fanCount: finite(r.fanCount) && Number.isInteger(r.fanCount) && r.fanCount > 0 && r.fanCount <= 16 ? r.fanCount : undefined,
    };
  }
  return slot;
}

/** The layout the setup record carries, or null when it is missing or malformed. Entries that fail validation are dropped. */
export function parseCaseLayout(raw: unknown): CaseLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const size = vec3(r.size, true);
  if (!size || !Array.isArray(r.boxes) || !Array.isArray(r.fanSlots)) return null;
  if (r.boxes.length > MAX_BOXES || r.fanSlots.length > MAX_SLOTS) return null;
  return {
    size,
    boxes: r.boxes.map(parseBox).filter((b): b is CaseBox => b !== null),
    fanSlots: r.fanSlots.map(parseSlot).filter((s): s is CaseFanSlot => s !== null),
    ...(r.windowRight === true ? { windowRight: true } : {}),
    ...(typeof r.caseModel === 'string' && r.caseModel.length <= 120 ? { caseModel: r.caseModel } : {}),
  };
}

/** Case extents in scene axes [x, y, z]. */
export const caseExtents = (layout: CaseLayout): Vec3 => [layout.size[0], layout.size[2], layout.size[1]];

/** Rear and top mounts exhaust; every other position takes air in. */
export const defaultDirection = (position: string): FanDirection => (position === 'rear' || position === 'top' ? 'exhaust' : 'intake');

export type DirectionOverrides = Readonly<Record<string, FanDirection>>;

export const directionOf = (slot: Pick<CaseFanSlot, 'key' | 'position'>, overrides: DirectionOverrides): FanDirection =>
  overrides[slot.key] ?? defaultDirection(slot.position);

/** Overrides with `slot` set to `direction`; a value equal to the default drops the override. */
export function withDirection(overrides: DirectionOverrides, slot: Pick<CaseFanSlot, 'key' | 'position'>, direction: FanDirection): Record<string, FanDirection> {
  const next = { ...overrides };
  if (direction === defaultDirection(slot.position)) delete next[slot.key]; else next[slot.key] = direction;
  return next;
}

export interface FanBinding {
  channelId: string;
  slotKeys: string[];
}

export const MAX_SLOT_KEYS_PER_BINDING = 16;

/** Binds `slotKey` to `channelId`, or unbinds it when that channel already holds it. A slot belongs to one channel. */
export function toggleBinding(bindings: readonly FanBinding[], channelId: string, slotKey: string): FanBinding[] {
  const held = bindings.find(b => b.channelId === channelId)?.slotKeys.includes(slotKey) ?? false;
  const others = bindings
    .filter(b => b.channelId !== channelId)
    .map(b => ({ ...b, slotKeys: b.slotKeys.filter(k => k !== slotKey) }));
  const own = bindings.find(b => b.channelId === channelId)?.slotKeys ?? [];
  const slotKeys = held ? own.filter(k => k !== slotKey) : [...own, slotKey].slice(0, MAX_SLOT_KEYS_PER_BINDING);
  return [...others, { channelId, slotKeys }].filter(b => b.slotKeys.length > 0);
}

/** Simulated fans: a binding on `sim:<rpm>` groups the slots pinned to that fixed speed, with no device behind them. */
export const SIM_PREFIX = 'sim:';
export const SIM_RPM_MIN = 0;
export const SIM_RPM_MAX = 3000;
export const SIM_RPM_STEP = 100;
export const SIM_RPM_DEFAULT = 1500;
export const MAX_BINDINGS = 64;
export const simChannelId = (rpm: number): string => `${SIM_PREFIX}${rpm}`;
export const isSimChannel = (channelId: string): boolean => channelId.startsWith(SIM_PREFIX);
/** The binding that marks a GPU fan slot as deliberately unlinked, so a derived default stays off it. */
export const NONE_CHANNEL = 'none';
export const isGpuSlot = (slotKey: string): boolean => slotKey.startsWith('gpu:');

/** `channelId` drives `slotKey` afterwards and the slot leaves whatever channel held it. A real device also leaves its other fans; a simulated channel keeps its other slots, since any number can share a speed. A new simulated binding past the service's binding cap changes nothing. An empty `channelId` unlinks the fan; on a GPU slot that stores the `none` marker instead of nothing. */
export function linkChannelToSlot(bindings: readonly FanBinding[], channelId: string, slotKey: string): FanBinding[] {
  const sim = isSimChannel(channelId);
  const rest = bindings
    .filter(b => sim || b.channelId !== channelId)
    .map(b => ({ ...b, slotKeys: b.slotKeys.filter(k => k !== slotKey) }))
    .filter(b => b.slotKeys.length > 0);
  if (channelId === '') {
    if (!isGpuSlot(slotKey)) return rest;
    const marked = rest.find(b => b.channelId === NONE_CHANNEL)?.slotKeys ?? [];
    return [...rest.filter(b => b.channelId !== NONE_CHANNEL), { channelId: NONE_CHANNEL, slotKeys: [...marked, slotKey] }];
  }
  if (!sim) return [...rest, { channelId, slotKeys: [slotKey] }];
  const own = rest.find(b => b.channelId === channelId)?.slotKeys ?? [];
  if (own.length === 0 && rest.length >= MAX_BINDINGS) return [...bindings];
  return [...rest.filter(b => b.channelId !== channelId), { channelId, slotKeys: [...own, slotKey].slice(-MAX_SLOT_KEYS_PER_BINDING) }];
}

export const channelOfSlot = (bindings: readonly FanBinding[], slotKey: string): string | null =>
  bindings.find(b => b.slotKeys.includes(slotKey))?.channelId ?? null;

export const slotsOfChannel = (bindings: readonly FanBinding[], channelId: string | null): string[] =>
  channelId ? bindings.find(b => b.channelId === channelId)?.slotKeys ?? [] : [];

export interface FanSlotGeometry {
  slot: CaseFanSlot;
  box: CaseBox;
}

/** Slots with a drawn box, taken or empty: the slot's own box on newer records, else a fan box or ghost Build kept. Radiator slots are left out. */
export function fanGeometries(layout: CaseLayout): FanSlotGeometry[] {
  const byKey = new Map<string, CaseBox>();
  for (const box of layout.boxes) {
    if (box.slot !== 'fan' || !box.select) continue;
    byKey.set(box.select.replace(/^(fan|slot):/, ''), box);
  }
  const out: FanSlotGeometry[] = [];
  for (const slot of layout.fanSlots) {
    if (slot.taken === 'radiator') continue;
    const own = slot.box ? { slot: 'fan', role: slot.taken ? 'part' : 'ghost', min: slot.box.min, size: slot.box.size, rotationY: slot.box.rotationY } : undefined;
    const box = own ?? byKey.get(slot.key);
    if (box) out.push({ slot, box });
  }
  return out;
}

/** Overlap, mm squared, of two slots on their face plane (the plane across the slot axis); 0 when they only touch. */
function planeOverlap(a: CaseFanSlot, b: CaseFanSlot): number {
  if (!a.box || !b.box || a.position !== b.position) return 0;
  const axis = a.box.size.indexOf(Math.min(...a.box.size));
  let area = 1;
  for (let i = 0; i < 3; i++) {
    if (i === axis) continue;
    const span = Math.min(a.box.min[i] + a.box.size[i], b.box.min[i] + b.box.size[i]) - Math.max(a.box.min[i], b.box.min[i]);
    if (span <= TOUCH_MM) return 0;
    area *= span;
  }
  return area;
}

/** Face-plane overlap up to this many mm counts as touching, not overlapping; box coordinates carry rounding. */
const TOUCH_MM = 0.05;

export interface MountCollapse {
  layout: CaseLayout;
  /** The shown slot standing for `key`: the key itself, or the shown slot it overlaps most. */
  canonOf: (key: string) => string;
}

/**
 * One drawn slot per physical mount, chosen greedily: installed first, then bound, then the larger size, then slot order.
 * A slot is drawn only when it overlaps no slot already drawn on its face; each hidden slot stands for the drawn slot it overlaps most.
 * Drawn slots that hold a bound device count as installed fans. Hidden slots are dropped from the layout.
 */
export function collapseMounts(layout: CaseLayout, boundKeys: readonly string[]): MountCollapse {
  const slots = layout.fanSlots;
  const bound = new Set(boundKeys);
  const rank = (s: CaseFanSlot) => (s.taken !== null ? 2 : bound.has(s.key) ? 1 : 0);
  const order = slots.map((_, i) => i).sort((x, y) => rank(slots[y]) - rank(slots[x]) || slots[y].size - slots[x].size || x - y);
  const chosen: number[] = [];
  for (const i of order) if (chosen.every(j => planeOverlap(slots[i], slots[j]) === 0)) chosen.push(i);
  const shown = new Set(chosen);
  const canon = new Map<string, string>();
  slots.forEach((s, i) => {
    if (shown.has(i)) { canon.set(s.key, s.key); return; }
    let top = chosen[0];
    let best = -1;
    for (const j of chosen) {
      const o = planeOverlap(s, slots[j]);
      if (o > best) { best = o; top = j; }
    }
    canon.set(s.key, slots[top].key);
  });
  let changed = shown.size !== slots.length;
  const fanSlots = slots.filter((_, i) => shown.has(i)).map(slot => {
    const holds = [...bound].some(k => canon.get(k) === slot.key);
    if (slot.taken !== null || !holds) return slot;
    changed = true;
    return { ...slot, taken: 'fan' as const };
  });
  return { layout: changed ? { ...layout, fanSlots } : layout, canonOf: key => canon.get(key) ?? key };
}

/** Bindings with every slot key pointed at its shown slot, repeats dropped, so a binding never names a hidden alternative. */
export function normalizeBindings(bindings: readonly FanBinding[], canonOf: (key: string) => string): FanBinding[] {
  return bindings.map(b => ({ ...b, slotKeys: [...new Set(b.slotKeys.map(canonOf))] }));
}

/** The layout with one slot per mount and every empty slot named in `boundKeys` marked as holding a fan. */
export function withBoundFans(layout: CaseLayout, boundKeys: readonly string[]): CaseLayout {
  return collapseMounts(layout, boundKeys).layout;
}
