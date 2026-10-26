import type { FanDirection } from './pressureModel';
import { SIM_PREFIX } from './fanSpeed';
import { gpuFanSlots } from './gpuFans';
import { radiatorFanSlots } from './radiatorFans';

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
  fans?: { axis: 'x' | 'y' | 'z'; diameter: number; count?: number; side?: 'min' | 'max'; bothSides?: boolean; sizes?: number[]; faces?: ('cooler' | 'backplate')[] };
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

/** One placement of the AIO radiator, as Build resolved it: the box it fills, the case slots it covers and the case slots that keep a fan. */
export interface RadiatorOption {
  mount: string;
  box: CaseBox;
  radiator: string[];
  fans: string[];
  /** The AIO hoses at this mount; absent in a record Build wrote before it carried them. */
  tubes?: CaseTube[];
}

/** An AIO hose: a tube of `radius` mm through `points` (a smooth curve), in layout mm. */
export interface CaseTube {
  radius: number;
  points: Vec3[];
}

export interface CaseLayout {
  /** Outer case [depth, width, height]; box sizes are [depth, height, width]. */
  size: Vec3;
  boxes: CaseBox[];
  fanSlots: CaseFanSlot[];
  /** The glass is on the right as seen from the front; Build's exported model mirrors x for it. */
  windowRight?: boolean;
  /** The AIO hoses at the radiator's current mount. */
  tubes?: CaseTube[];
  /** The mount the radiator sits on in this layout: the chosen option's, else the one Build resolved. */
  radiatorMount?: string;
  /** Every mount the radiator can take, with the box it would fill; present with two or more. */
  radiatorOptions?: RadiatorOption[];
  /** Set when the chosen mount is not the one the record was resolved with: the radiator box as the model draws it, and where it now goes. */
  radiatorMove?: { from: CaseBox; to: CaseBox };
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

/** Per-fan ring diameters and faces; each list is kept only when it is entirely valid and matches the fan count. */
function ringLists(fans: Record<string, unknown>): { sizes?: number[]; faces?: ('cooler' | 'backplate')[] } {
  const count = finite(fans.count) ? fans.count : 0;
  const sizes = Array.isArray(fans.sizes) && fans.sizes.length === count && fans.sizes.every(n => finite(n) && n > 0 && n <= MAX_DIM_MM) ? (fans.sizes as number[]) : undefined;
  const faces = Array.isArray(fans.faces) && fans.faces.length === count && fans.faces.every(f => f === 'cooler' || f === 'backplate') ? (fans.faces as ('cooler' | 'backplate')[]) : undefined;
  return { ...(sizes ? { sizes } : {}), ...(faces ? { faces } : {}) };
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
    box.fans = { axis: fans.axis, diameter: fans.diameter, ...(finite(fans.count) && Number.isInteger(fans.count) && fans.count > 0 && fans.count <= 8 ? { count: fans.count } : {}), ...(fans.side === 'min' || fans.side === 'max' ? { side: fans.side } : {}), ...(fans.bothSides === true ? { bothSides: true } : {}), ...ringLists(fans) };
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

const MAX_OPTIONS = 8;
const MAX_TUBES = 4;
const MAX_TUBE_POINTS = 12;
const MAX_TUBE_RADIUS_MM = 30;

function parseTubes(raw: unknown): CaseTube[] {
  if (!Array.isArray(raw)) return [];
  const out: CaseTube[] = [];
  for (const t of raw.slice(0, MAX_TUBES) as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object' || !finite(t.radius) || t.radius <= 0 || t.radius > MAX_TUBE_RADIUS_MM) continue;
    if (!Array.isArray(t.points) || t.points.length < 2 || t.points.length > MAX_TUBE_POINTS) continue;
    const points = t.points.map(p => vec3(p, false));
    if (points.every((p): p is Vec3 => p !== null)) out.push({ radius: t.radius, points });
  }
  return out;
}

/** The pick key of the radiator box itself, for a radiator with no fans to pick. */
export const RADIATOR_PICK_KEY = 'radiator';

/** Build rounds option boxes to tenths of a millimeter while the record's own boxes are raw. */
const BOX_TOLERANCE_MM = 0.05;

function parseOptions(raw: unknown): RadiatorOption[] {
  if (!Array.isArray(raw)) return [];
  const keys = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= MAX_SLOTS && v.every(keyOf) ? (v as string[]) : null);
  const out: RadiatorOption[] = [];
  for (const o of raw.slice(0, MAX_OPTIONS) as Record<string, unknown>[]) {
    const box = o && typeof o === 'object' ? parseBox(o.box) : null;
    const radiator = o ? keys(o.radiator) : null;
    const fans = o ? keys(o.fans) : null;
    const tubes = o ? parseTubes(o.tubes) : [];
    if (box && radiator && fans && keyOf(o.mount) && !out.some(x => x.mount === o.mount)) out.push({ mount: o.mount, box, radiator, fans, ...(tubes.length > 0 ? { tubes } : {}) });
  }
  return out;
}

const isRadiatorBox = (b: CaseBox): boolean => b.slot === 'cooler' && b.fans?.bothSides === true && !!b.fans.count;

/** The layout the setup record carries, or null when it is missing or malformed. Entries that fail validation are dropped. `choice` is the mount the user picked; it applies when it names one of the record's options and differs from the mount the record was resolved with. */
export function parseCaseLayout(raw: unknown, choice?: string | null): CaseLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const size = vec3(r.size, true);
  if (!size || !Array.isArray(r.boxes) || !Array.isArray(r.fanSlots)) return null;
  if (r.boxes.length > MAX_BOXES || r.fanSlots.length > MAX_SLOTS) return null;
  let boxes = r.boxes.map(parseBox).filter((b): b is CaseBox => b !== null);
  let slots = r.fanSlots.map(parseSlot).filter((s): s is CaseFanSlot => s !== null);
  const resolvedMount = keyOf(r.radiatorMount) ? r.radiatorMount : undefined;
  const options = parseOptions(r.radiatorOptions);
  const picked = choice && choice !== resolvedMount ? options.find(o => o.mount === choice) : undefined;
  let radiatorMove: CaseLayout['radiatorMove'];
  if (picked) {
    const current = options.find(o => o.mount === resolvedMount)?.box;
    const sameBox = (x: CaseBox) => !!current && x.slot === current.slot && x.min.every((v, i) => Math.abs(v - current.min[i]) <= BOX_TOLERANCE_MM) && x.size.every((v, i) => Math.abs(v - current.size[i]) <= BOX_TOLERANCE_MM);
    // A fanless radiator box carries no `fans`, so the current option's box finds it first.
    const at = boxes.some(sameBox) ? boxes.findIndex(sameBox) : boxes.findIndex(isRadiatorBox);
    if (at >= 0) {
      radiatorMove = { from: boxes[at], to: picked.box };
      boxes = boxes.map((b, i) => (i === at ? picked.box : b));
    }
    slots = slots.map(s => ({ ...s, taken: picked.radiator.includes(s.key) ? 'radiator' : picked.fans.includes(s.key) ? 'fan' : null }));
  }
  const mount = picked?.mount ?? resolvedMount;
  // Build's hose lines are the resolved mount's; a moved radiator takes its option's, and none when the record has none.
  const tubes = picked ? picked.tubes ?? [] : parseTubes(Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]).filter(l => l && typeof l === 'object' && l.radius !== undefined) : []);
  return {
    size,
    boxes,
    ...(tubes.length > 0 ? { tubes } : {}),
    fanSlots: [...slots, ...gpuFanSlots(boxes), ...radiatorFanSlots(boxes, size, slots, mount)],
    ...(mount ? { radiatorMount: mount } : {}),
    ...(options.length >= 2 ? { radiatorOptions: options } : {}),
    ...(radiatorMove ? { radiatorMove } : {}),
    ...(r.windowRight === true ? { windowRight: true } : {}),
    ...(typeof r.caseModel === 'string' && r.caseModel.length <= 120 ? { caseModel: r.caseModel } : {}),
  };
}

/** Case extents in scene axes [x, y, z]. */
export const caseExtents = (layout: CaseLayout): Vec3 => [layout.size[0], layout.size[2], layout.size[1]];

/** Rear and top mounts exhaust; every other position takes air in. */
export const defaultDirection = (position: string): FanDirection => (position === 'rear' || position === 'top' ? 'exhaust' : 'intake');

export type DirectionOverrides = Readonly<Record<string, FanDirection>>;

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

/** A binding on a simulated channel id groups the slots pinned to that fixed speed, with no device behind them. */
export const SIM_RPM_MIN = 0;
export const SIM_RPM_STEP = 100;
export const SIM_RPM_DEFAULT = 1500;
export const MAX_BINDINGS = 64;
export const simChannelId = (rpm: number): string => `${SIM_PREFIX}${rpm}`;
export const isSimChannel = (channelId: string): boolean => channelId.startsWith(SIM_PREFIX);
/** The binding that marks a fan with a derived default as deliberately unlinked, so the default stays off it. */
export const NONE_CHANNEL = 'none';
/** GPU and AIO fan slots get a derived default link, so unlinking one stores an explicit override. */
export const hasDerivedLink = (slotKey: string): boolean => slotKey.startsWith('gpu:') || slotKey.startsWith('rad:');

/** `channelId` drives `slotKey` afterwards and the slot leaves whatever channel held it. A channel keeps its other slots, since one device can drive several fans; a channel already at the per-binding cap, or a new binding past the service's binding cap, changes nothing. An empty `channelId` unlinks the fan; on a slot with a derived default (`derivedDefault`, GPU and radiator slots by key) that stores the `none` marker instead of nothing. */
export function linkChannelToSlot(bindings: readonly FanBinding[], channelId: string, slotKey: string, derivedDefault: boolean = hasDerivedLink(slotKey)): FanBinding[] {
  const rest = bindings
    .map(b => ({ ...b, slotKeys: b.slotKeys.filter(k => k !== slotKey) }))
    .filter(b => b.slotKeys.length > 0);
  if (channelId === '') {
    if (!derivedDefault) return rest;
    // The service takes at most MAX_SLOT_KEYS_PER_BINDING keys per binding, so the markers fill one binding and then start another.
    const marked = [...rest.filter(b => b.channelId === NONE_CHANNEL).flatMap(b => b.slotKeys), slotKey];
    const chunks = Array.from({ length: Math.ceil(marked.length / MAX_SLOT_KEYS_PER_BINDING) }, (_, i) => ({ channelId: NONE_CHANNEL, slotKeys: marked.slice(i * MAX_SLOT_KEYS_PER_BINDING, (i + 1) * MAX_SLOT_KEYS_PER_BINDING) }));
    const kept = rest.filter(b => b.channelId !== NONE_CHANNEL);
    // Past the service's binding cap the unlink is refused, as a link is.
    return kept.length + chunks.length > MAX_BINDINGS ? [...bindings] : [...kept, ...chunks];
  }
  const own = rest.find(b => b.channelId === channelId)?.slotKeys ?? [];
  if (own.length >= MAX_SLOT_KEYS_PER_BINDING || (own.length === 0 && rest.length >= MAX_BINDINGS)) return [...bindings];
  return [...rest.filter(b => b.channelId !== channelId), { channelId, slotKeys: [...own, slotKey] }];
}

export const channelOfSlot = (bindings: readonly FanBinding[], slotKey: string): string | null =>
  bindings.find(b => b.slotKeys.includes(slotKey))?.channelId ?? null;

export const slotsOfChannel = (bindings: readonly FanBinding[], channelId: string | null): string[] =>
  channelId ? bindings.find(b => b.channelId === channelId)?.slotKeys ?? [] : [];

export interface FanSlotGeometry {
  slot: CaseFanSlot;
  box: CaseBox;
}

/** Slots with a drawn box, taken or empty: the slot's own box on newer records, else a fan box or ghost Build kept. A case slot the radiator covers has no fan of its own. */
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
 * Radiator (`rad:`) and graphics card (`gpu:`) fan slots always stand alone: each is a real fan, never an alternative mount, and a card's neighbors can overlap by the frame padding. A slot is drawn only when it overlaps no slot already drawn on its face; each hidden slot stands for the drawn slot it overlaps most.
 * Drawn slots that hold a bound device count as installed fans. Hidden slots are dropped from the layout.
 */
export function collapseMounts(layout: CaseLayout, boundKeys: readonly string[]): MountCollapse {
  const slots = layout.fanSlots;
  const bound = new Set(boundKeys);
  const rank = (s: CaseFanSlot) => (s.taken !== null ? 2 : bound.has(s.key) ? 1 : 0);
  const own = (s: CaseFanSlot) => s.key.startsWith('rad:') || s.key.startsWith('gpu:');
  const order = slots.map((_, i) => i).filter(i => !own(slots[i])).sort((x, y) => rank(slots[y]) - rank(slots[x]) || slots[y].size - slots[x].size || x - y);
  const chosen: number[] = [];
  for (const i of order) if (chosen.every(j => planeOverlap(slots[i], slots[j]) === 0)) chosen.push(i);
  const shown = new Set([...chosen, ...slots.flatMap((s, i) => (own(s) ? [i] : []))]);
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
