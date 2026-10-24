import type { FanDirection } from './pressureModel';

/** Read-only view of the PcLayout nexus-build writes as `resolved.caseLayout`. Millimeters; x front to rear, y up, z from the window side. */
export type Vec3 = [number, number, number];

export interface CaseBox {
  slot: string;
  role: string;
  min: Vec3;
  size: Vec3;
  select?: string;
  rotationY?: number;
  fans?: { axis: 'x' | 'y' | 'z'; diameter: number };
}

export interface CaseFanSlot {
  key: string;
  position: string;
  size: number;
  index: number;
  taken: 'fan' | 'radiator' | null;
}

export interface CaseLayout {
  /** Outer case [depth, width, height]; box sizes are [depth, height, width]. */
  size: Vec3;
  boxes: CaseBox[];
  fanSlots: CaseFanSlot[];
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
  return box;
}

function parseSlot(raw: unknown): CaseFanSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!keyOf(s.key) || typeof s.position !== 'string' || !finite(s.size) || !finite(s.index)) return null;
  const taken = s.taken === 'fan' || s.taken === 'radiator' ? s.taken : null;
  return { key: s.key, position: s.position, size: s.size, index: s.index, taken };
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

export const channelOfSlot = (bindings: readonly FanBinding[], slotKey: string): string | null =>
  bindings.find(b => b.slotKeys.includes(slotKey))?.channelId ?? null;

export const slotsOfChannel = (bindings: readonly FanBinding[], channelId: string | null): string[] =>
  channelId ? bindings.find(b => b.channelId === channelId)?.slotKeys ?? [] : [];

export interface FanSlotGeometry {
  slot: CaseFanSlot;
  box: CaseBox;
}

/** Slots that have a drawn box: occupied fans always, empty slots only where Build kept a ghost. Radiator slots are left out. */
export function fanGeometries(layout: CaseLayout): FanSlotGeometry[] {
  const byKey = new Map<string, CaseBox>();
  for (const box of layout.boxes) {
    if (box.slot !== 'fan' || !box.select) continue;
    byKey.set(box.select.replace(/^(fan|slot):/, ''), box);
  }
  const out: FanSlotGeometry[] = [];
  for (const slot of layout.fanSlots) {
    if (slot.taken === 'radiator') continue;
    const box = byKey.get(slot.key);
    if (box) out.push({ slot, box });
  }
  return out;
}
