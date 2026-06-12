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

/**
 * Full partition POST body with one zone replaced by its split parts. The
 * remainder parts keep the original zone's name; the split-out run gets the
 * user-provided one.
 */
export function buildSplitZonesBody(
  zones: DeviceZone[],
  offsets: Map<number, number>,
  zoneId: string,
  parts: SplitParts,
  newZoneName: string,
): DeviceZoneDef[] {
  const body: DeviceZoneDef[] = [];
  for (const zone of orderZones(zones, offsets)) {
    if (zone.id !== zoneId) {
      body.push({ name: zone.name, slices: zone.slices });
      continue;
    }
    if (parts.before.length > 0) body.push({ name: zone.name, slices: parts.before });
    body.push({ name: newZoneName, slices: parts.selected });
    if (parts.after.length > 0) body.push({ name: zone.name, slices: parts.after });
  }
  return body;
}

/**
 * Full partition POST body with the selected zones collapsed into one. The
 * merged zone sits at the block's device-order position and keeps the first
 * member's name.
 */
export function buildMergeZonesBody(
  zones: DeviceZone[],
  offsets: Map<number, number>,
  selectedIds: Set<string>,
): DeviceZoneDef[] {
  const ordered = orderZones(zones, offsets);
  const members = ordered.filter(z => selectedIds.has(z.id));
  const merged: DeviceZoneDef = { name: members[0]?.name ?? '', slices: mergeZoneSlices(members) };
  const body: DeviceZoneDef[] = [];
  let inserted = false;
  for (const zone of ordered) {
    if (selectedIds.has(zone.id)) {
      if (!inserted) {
        body.push(merged);
        inserted = true;
      }
      continue;
    }
    body.push({ name: zone.name, slices: zone.slices });
  }
  return body;
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
