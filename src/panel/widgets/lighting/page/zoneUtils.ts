// Pure helpers for the device-scoped LED map editor: device-space index
// math, zone-local <-> segment-local mapping, merge/split candidate
// computation, partition POST bodies, and save-body construction. Kept free
// of React/DOM so they are unit-testable.

import type {
  DeviceMapOverride, DeviceMapResponse, DeviceSegment, DeviceZone, DeviceZoneDef, ZoneSlice,
} from '../../../../api/lighting';

/** One LED of the flattened device map, addressable three ways: by segment-local index (the override key), by device-space index (canvas identity), and by zone membership. */
export interface EditorLed {
  /** Owning segment index. */
  segment: number;
  /** Segment-local LED index. */
  ledIndex: number;
  /** Device-space index: segment-local index plus the concatenated offset of all prior segments. */
  index: number;
  u: number;
  v: number;
  disabled: boolean;
  zoneId: string;
  isCustom: boolean;
}

/** Device-space offset of each segment, concatenating segments in index order. */
export function segmentOffsets(segments: { index: number; ledCount: number }[]): Map<number, number> {
  const sorted = [...segments].sort((a, b) => a.index - b.index);
  const offsets = new Map<number, number>();
  let offset = 0;
  for (const seg of sorted) {
    offsets.set(seg.index, offset);
    offset += seg.ledCount;
  }
  return offsets;
}

/** Flatten the device-map response into device-space order. */
export function flattenDeviceMap(map: DeviceMapResponse): EditorLed[] {
  const offsets = segmentOffsets(map.segments);
  const flat: EditorLed[] = [];
  for (const seg of [...map.segments].sort((a, b) => a.index - b.index)) {
    const offset = offsets.get(seg.index) ?? 0;
    for (const led of [...seg.leds].sort((a, b) => a.index - b.index)) {
      flat.push({
        segment: seg.index,
        ledIndex: led.index,
        index: offset + led.index,
        u: led.u,
        v: led.v,
        disabled: led.disabled,
        zoneId: led.zoneId,
        isCustom: led.isCustom,
      });
    }
  }
  return flat;
}

export function zoneLedCount(zone: { slices: ZoneSlice[] }): number {
  return zone.slices.reduce((sum, s) => sum + s.count, 0);
}

/** Enabled (non-parked) LED count per zone id in the current editor state. */
export function zoneEnabledCounts(leds: { zoneId: string; disabled: boolean }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const led of leds) {
    if (led.disabled) continue;
    counts.set(led.zoneId, (counts.get(led.zoneId) ?? 0) + 1);
  }
  return counts;
}

/** Zone chip count label: "enabled/total" while some of the zone's LEDs are parked, collapsing to just the total when none are. */
export function formatZoneChipCount(enabled: number, total: number): string {
  return enabled === total ? String(total) : `${enabled}/${total}`;
}

/** Enabled LED count of a device card, falling back to the total for services that predate the field. */
export function cardEnabledLedCount(card: { ledCount: number; enabledLedCount?: number }): number {
  return card.enabledLedCount ?? card.ledCount;
}

/**
 * True when a card has LEDs but every one of them is disabled. Cards
 * reporting no LEDs at all are NOT fully parked - they keep their existing
 * unavailable / configure-LED-count affordances. Whether a fully parked
 * card actually hides is decided per device by visibleCards.
 */
export function isCardFullyParked(card: { ledCount: number; enabledLedCount?: number }): boolean {
  return card.ledCount > 0 && cardEnabledLedCount(card) === 0;
}

/** Owning enumeration-unit device id of a card; falls back to the card id for single-zone standalone devices and older services. */
function cardOwningDeviceId(card: { id: string; deviceId?: string }): string {
  return card.deviceId || card.id;
}

/**
 * Listing/canvas visibility filter: fully parked zone cards hide, but never
 * a device's last visible card. A device whose cards would all hide keeps
 * its first card (in list order) showing its zero-enabled badge, so the
 * device stays reachable and its LED map editor entry point survives.
 */
export function visibleCards<T extends { id: string; deviceId?: string; ledCount: number; enabledLedCount?: number }>(
  cards: T[],
): T[] {
  const devicesWithVisible = new Set<string>();
  for (const card of cards) {
    if (!isCardFullyParked(card)) devicesWithVisible.add(cardOwningDeviceId(card));
  }
  const keptFallback = new Set<string>();
  return cards.filter(card => {
    if (!isCardFullyParked(card)) return true;
    const dev = cardOwningDeviceId(card);
    if (devicesWithVisible.has(dev) || keptFallback.has(dev)) return false;
    keptFallback.add(dev);
    return true;
  });
}

/** Device-space indices covered by a zone, in zone-local order. */
export function zoneDeviceIndices(zone: { slices: ZoneSlice[] }, offsets: Map<number, number>): number[] {
  const indices: number[] = [];
  for (const slice of zone.slices) {
    const base = (offsets.get(slice.segment) ?? 0) + slice.start;
    for (let i = 0; i < slice.count; i++) indices.push(base + i);
  }
  return indices;
}

/**
 * Map device-space indices to the zone-local indices the per-card endpoints
 * (highlight, test pattern) speak. Indices outside the zone are dropped.
 */
export function toZoneLocalIndices(
  zone: { slices: ZoneSlice[] },
  offsets: Map<number, number>,
  deviceIndices: Iterable<number>,
): number[] {
  const localByDevice = new Map<number, number>();
  zoneDeviceIndices(zone, offsets).forEach((devIdx, local) => localByDevice.set(devIdx, local));
  const out: number[] = [];
  for (const idx of deviceIndices) {
    const local = localByDevice.get(idx);
    if (local !== undefined) out.push(local);
  }
  return out.sort((a, b) => a - b);
}

/** True when any of the zone's slices lives on a resizable segment (a partition wall). */
export function zoneTouchesResizable(zone: { slices: ZoneSlice[] }, segments: DeviceSegment[]): boolean {
  const resizable = new Set(segments.filter(s => s.resizable).map(s => s.index));
  return zone.slices.some(s => resizable.has(s.segment));
}

/** Zones sorted by their first slice's device-space position. */
export function orderZones<T extends { slices: ZoneSlice[] }>(zones: T[], offsets: Map<number, number>): T[] {
  const startOf = (z: T) => {
    const first = z.slices[0];
    if (!first) return Number.MAX_SAFE_INTEGER;
    return (offsets.get(first.segment) ?? 0) + first.start;
  };
  return [...zones].sort((a, b) => startOf(a) - startOf(b));
}

export type MergeBlockReason = 'selection' | 'adjacency' | 'wall';

export interface MergeCheck {
  ok: boolean;
  reason: MergeBlockReason | null;
}

/**
 * Whether the selected zones can merge into one. Requires at least two
 * zones forming a contiguous block in device order, none of which touches
 * a resizable segment (index stability: a resized segment would shift the
 * concatenated indices of anything merged across it).
 *
 * Relies on the service invariant that every zone's slices form one
 * unbroken device-space run and the partition fully covers the segments,
 * which is what makes positional adjacency (consecutive in device order)
 * equal real index abutment. A guard re-verifies it on the selection: if
 * the selected zones' concatenated device indices are not strictly
 * consecutive (a disjoint-slice zone, or another zone's slice interleaved
 * inside the block), the merge is refused rather than producing a merged
 * zone interleaved with foreign LEDs.
 */
export function checkMerge(
  selectedIds: Set<string>,
  zones: DeviceZone[],
  segments: DeviceSegment[],
  offsets: Map<number, number>,
): MergeCheck {
  if (selectedIds.size < 2) return { ok: false, reason: 'selection' };
  const ordered = orderZones(zones, offsets);
  const positions = ordered
    .map((z, i) => (selectedIds.has(z.id) ? i : -1))
    .filter(i => i >= 0);
  if (positions.length !== selectedIds.size) return { ok: false, reason: 'selection' };
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (!contiguous) return { ok: false, reason: 'adjacency' };
  const memberIndices = ordered
    .filter(z => selectedIds.has(z.id))
    .flatMap(z => zoneDeviceIndices(z, offsets));
  const consecutive = memberIndices.every((idx, i) => i === 0 || idx === memberIndices[i - 1] + 1);
  if (!consecutive) return { ok: false, reason: 'adjacency' };
  const walled = ordered.some(z => selectedIds.has(z.id) && zoneTouchesResizable(z, segments));
  if (walled) return { ok: false, reason: 'wall' };
  return { ok: true, reason: null };
}

/** Concatenate slices in device order, joining runs that abut within one segment. */
export function mergeZoneSlices(zonesInDeviceOrder: { slices: ZoneSlice[] }[]): ZoneSlice[] {
  const merged: ZoneSlice[] = [];
  for (const zone of zonesInDeviceOrder) {
    for (const slice of zone.slices) {
      const last = merged[merged.length - 1];
      if (last && last.segment === slice.segment && last.start + last.count === slice.start) {
        last.count += slice.count;
      } else {
        merged.push({ ...slice });
      }
    }
  }
  return merged;
}

/** Slices covering the zone-local range [fromPos, fromPos + count). */
function sliceZoneRange(zone: { slices: ZoneSlice[] }, fromPos: number, count: number): ZoneSlice[] {
  const out: ZoneSlice[] = [];
  let pos = 0;
  let remaining = count;
  for (const slice of zone.slices) {
    if (remaining <= 0) break;
    const sliceEnd = pos + slice.count;
    if (sliceEnd <= fromPos) {
      pos = sliceEnd;
      continue;
    }
    const localStart = Math.max(0, fromPos - pos);
    const take = Math.min(slice.count - localStart, remaining);
    out.push({ segment: slice.segment, start: slice.start + localStart, count: take });
    remaining -= take;
    pos = sliceEnd;
  }
  return out;
}

export interface SplitParts {
  /** Empty when the selection starts at the zone's first LED. */
  before: ZoneSlice[];
  selected: ZoneSlice[];
  /** Empty when the selection ends at the zone's last LED. */
  after: ZoneSlice[];
}

/**
 * Split a zone around the selected device-space indices. Returns null when
 * the selection misses the zone, is not one contiguous zone-local run
 * (every zone's slices must stay contiguous in device order), or covers the
 * whole zone (a no-op split).
 */
export function splitZone(
  zone: { slices: ZoneSlice[] },
  offsets: Map<number, number>,
  selection: Set<number>,
): SplitParts | null {
  const devIndices = zoneDeviceIndices(zone, offsets);
  const positions = devIndices
    .map((devIdx, pos) => (selection.has(devIdx) ? pos : -1))
    .filter(p => p >= 0);
  if (positions.length === 0 || positions.length === devIndices.length) return null;
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (!contiguous) return null;
  const start = positions[0];
  const count = positions.length;
  return {
    before: sliceZoneRange(zone, 0, start),
    selected: sliceZoneRange(zone, start, count),
    after: sliceZoneRange(zone, start + count, devIndices.length - start - count),
  };
}

// ── Staged partition edits ──────────────────────────────────────────────
// Zone split / merge / rename / reset are staged locally (same undo stack
// and Save flow as LED drags) and only persist on Save. Zones created by a
// staged edit carry client-side temp ids so the rail stays interactive;
// the ids never reach the service (the POST body is id-free) and are
// replaced by service-assigned ids on the post-save refetch.

const STAGED_ZONE_ID_PREFIX = 'staged:';

export const stagedZoneId = (seq: number): string => `${STAGED_ZONE_ID_PREFIX}${seq}`;

/** True for client-side temp ids; per-card endpoints (highlight, test pattern, brightness) must not be called with these. */
export const isStagedZoneId = (id: string): boolean => id.startsWith(STAGED_ZONE_ID_PREFIX);

/** Locally staged replacement of the device's partition, rendered by the rail until Save persists it. */
export interface StagedPartition {
  /** 'reset' persists as the partition DELETE on Save; 'edited' as an explicit zones POST. */
  kind: 'edited' | 'reset';
  zones: DeviceZone[];
}

export function renameZone(zones: DeviceZone[], zoneId: string, name: string): DeviceZone[] {
  return zones.map(z => (z.id === zoneId ? { ...z, name } : z));
}

/**
 * Staged partition with the selected zones collapsed into one. The merged
 * zone sits at the block's device-order position, keeps the first member's
 * name, and carries the provided temp id; unselected zones keep their ids.
 */
export function mergeStagedZones(
  zones: DeviceZone[],
  offsets: Map<number, number>,
  selectedIds: Set<string>,
  mergedId: string,
): DeviceZone[] {
  const ordered = orderZones(zones, offsets);
  const members = ordered.filter(z => selectedIds.has(z.id));
  const merged: DeviceZone = { id: mergedId, name: members[0]?.name ?? '', slices: mergeZoneSlices(members) };
  const out: DeviceZone[] = [];
  let inserted = false;
  for (const zone of ordered) {
    if (selectedIds.has(zone.id)) {
      if (!inserted) {
        out.push(merged);
        inserted = true;
      }
      continue;
    }
    out.push(zone);
  }
  return out;
}

/**
 * Staged partition with one zone replaced by its split parts. The remainder
 * parts keep the original zone's name; the split-out run gets the
 * user-provided one. All parts are new shapes, so all get temp ids; the
 * split-out run's id is returned for selection.
 */
export function splitStagedZones(
  zones: DeviceZone[],
  offsets: Map<number, number>,
  zoneId: string,
  parts: SplitParts,
  newZoneName: string,
  nextId: () => string,
): { zones: DeviceZone[]; newZoneId: string } {
  const out: DeviceZone[] = [];
  let newZoneId = '';
  for (const zone of orderZones(zones, offsets)) {
    if (zone.id !== zoneId) {
      out.push(zone);
      continue;
    }
    if (parts.before.length > 0) out.push({ id: nextId(), name: zone.name, slices: parts.before });
    newZoneId = nextId();
    out.push({ id: newZoneId, name: newZoneName, slices: parts.selected });
    if (parts.after.length > 0) out.push({ id: nextId(), name: zone.name, slices: parts.after });
  }
  return { zones: out, newZoneId };
}

/**
 * Best-effort default partition for a staged reset. When the loaded
 * partition is already the default it is returned as-is (exact, original
 * ids - reachable when staged edits sit on top of a default partition).
 * Otherwise the true default lives service-side only, so the rail shows
 * one zone per segment: exact for split motherboards and the Keeb; devices
 * whose default is a single whole-device zone show finer-grained zones
 * until the post-save refetch returns the real default.
 */
export function defaultPartitionGuess(
  structure: { segments: DeviceSegment[]; zones: DeviceZone[]; isDefaultPartition: boolean },
  nextId: () => string,
): DeviceZone[] {
  if (structure.isDefaultPartition) return structure.zones;
  return [...structure.segments]
    .sort((a, b) => a.index - b.index)
    .map(s => ({
      id: nextId(),
      name: s.name,
      slices: [{ segment: s.index, start: 0, count: s.ledCount }],
    }));
}

/** Reassign each LED's zone membership from a (staged) partition. Positions, disabled state, and isCustom are untouched. */
export function relabelLedZones(
  leds: EditorLed[],
  zones: DeviceZone[],
  offsets: Map<number, number>,
): EditorLed[] {
  const zoneByDevice = new Map<number, string>();
  for (const z of zones) {
    for (const idx of zoneDeviceIndices(z, offsets)) zoneByDevice.set(idx, z.id);
  }
  return leds.map(l => {
    const zoneId = zoneByDevice.get(l.index);
    return zoneId !== undefined && zoneId !== l.zoneId ? { ...l, zoneId } : l;
  });
}

/** Id-free partition POST body in device order. */
export function partitionSaveBody(zones: DeviceZone[], offsets: Map<number, number>): DeviceZoneDef[] {
  return orderZones(zones, offsets).map(z => ({ name: z.name, slices: z.slices }));
}

// Tolerance below which two normalized coordinates count as the same spot.
const SAME_POSITION_EPSILON = 0.0001;
// Tolerance below which two aspect ratios count as unchanged.
const SAME_RATIO_EPSILON = 0.0001;

/** Per-LED resolved state captured on load: position plus disabled flag. */
export interface BaselineEntry {
  u: number;
  v: number;
  disabled: boolean;
}

/**
 * Loaded state of LEDs that carried no stored user override: the resolved
 * baseline. A session edit that lands an LED back on its baseline (same
 * position AND same disabled state) is a no-op and must not become an
 * override.
 */
export function baselineFrom(leds: EditorLed[]): Map<number, BaselineEntry> {
  const baseline = new Map<number, BaselineEntry>();
  for (const led of leds) {
    if (!led.isCustom) baseline.set(led.index, { u: led.u, v: led.v, disabled: led.disabled });
  }
  return baseline;
}

export interface DeviceMapSaveBody {
  overrides: DeviceMapOverride[];
  /** Zero when the user did not adjust the ratio this session; the service ignores zero and keeps whatever is stored. */
  aspectRatio: number;
}

/**
 * Build the device-map save body without baking an applied community
 * mapping into the user delta. `isCustom` is the user-ownership marker:
 * the service sets it only on stored user overrides and every editor
 * mutation sets it locally, so entries without it (mapping-positioned or
 * mapping-disabled LEDs) must not be re-posted as user data.
 */
export function buildDeviceMapSaveBody(args: {
  leds: EditorLed[];
  baseline: Map<number, BaselineEntry>;
  /** Current editor aspect ratio. */
  rectRatio: number;
  /** Ratio as it arrived on load, which may originate from an applied mapping. */
  loadedRatio: number;
}): DeviceMapSaveBody {
  const overrides: DeviceMapOverride[] = [];
  for (const led of args.leds) {
    if (!led.isCustom) continue;
    const base = args.baseline.get(led.index);
    // An override matching its baseline in both position and disabled
    // state is a no-op for the user map. A flipped disabled state must
    // round-trip even at the baseline spot: user-parked LEDs survive a
    // reload, and a mapping-disabled LED restored without being moved
    // still persists as re-enabled.
    const atBaseline = base
      && Math.abs(led.u - base.u) < SAME_POSITION_EPSILON
      && Math.abs(led.v - base.v) < SAME_POSITION_EPSILON
      && led.disabled === base.disabled;
    if (atBaseline) continue;
    overrides.push({
      segment: led.segment,
      ledIndex: led.ledIndex,
      u: led.u,
      v: led.v,
      disabled: led.disabled,
    });
  }
  const ratioChanged = Math.abs(args.rectRatio - args.loadedRatio) > SAME_RATIO_EPSILON;
  return {
    overrides,
    aspectRatio: ratioChanged ? args.rectRatio : 0,
  };
}

// ── Save plan ───────────────────────────────────────────────────────────

export type SavePlanPartition =
  | { kind: 'reset' }
  | { kind: 'edited'; zones: DeviceZoneDef[] };

/**
 * Everything a Save must post, in order: the partition first (when one is
 * staged), then the device-map overrides. The partition POST drops the
 * device's per-zone prefs / layouts and reassigns zone ids service-side,
 * so the map delta has to land after it and the editor must refetch.
 */
export interface SavePlan {
  partition: SavePlanPartition | null;
  map: DeviceMapSaveBody;
}

export function buildSavePlan(args: {
  staged: StagedPartition | null;
  offsets: Map<number, number>;
  leds: EditorLed[];
  baseline: Map<number, BaselineEntry>;
  rectRatio: number;
  loadedRatio: number;
}): SavePlan {
  const partition: SavePlanPartition | null = args.staged === null
    ? null
    : args.staged.kind === 'reset'
      ? { kind: 'reset' }
      : { kind: 'edited', zones: partitionSaveBody(args.staged.zones, args.offsets) };
  return {
    partition,
    map: buildDeviceMapSaveBody(args),
  };
}

// ── Undo / redo history ─────────────────────────────────────────────────
// Snapshots carry the LED state and the staged partition together so a
// single undo step reverts a partition op (split / merge / rename / reset)
// along with the LED relabeling it caused.

export interface EditorSnapshot {
  leds: EditorLed[];
  rectRatio: number;
  partition: StagedPartition | null;
}

export interface EditorHistory {
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
}

export const emptyHistory = (): EditorHistory => ({ undo: [], redo: [] });

/** Record a snapshot before a mutation; clears the redo branch. Oldest entries fall off beyond maxDepth. */
export function pushHistory(h: EditorHistory, snapshot: EditorSnapshot, maxDepth: number): EditorHistory {
  const undo = [...h.undo, snapshot];
  if (undo.length > maxDepth) undo.shift();
  return { undo, redo: [] };
}

/** Pop the last undo snapshot, pushing the current state onto redo. Null when there is nothing to undo. */
export function undoHistory(
  h: EditorHistory,
  current: EditorSnapshot,
): { history: EditorHistory; restored: EditorSnapshot } | null {
  if (h.undo.length === 0) return null;
  const restored = h.undo[h.undo.length - 1];
  return {
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, current] },
    restored,
  };
}

/** Pop the last redo snapshot, pushing the current state onto undo. Null when there is nothing to redo. */
export function redoHistory(
  h: EditorHistory,
  current: EditorSnapshot,
): { history: EditorHistory; restored: EditorSnapshot } | null {
  if (h.redo.length === 0) return null;
  const restored = h.redo[h.redo.length - 1];
  return {
    history: { undo: [...h.undo, current], redo: h.redo.slice(0, -1) },
    restored,
  };
}

/** How long an identify blink runs, on the hardware and on the card readout. */
export const IDENTIFY_MS = 2000;
