import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';
import { inferRadiatorFans } from './fanSpecs';

/** Depth of a drawn radiator fan along its axis, mm: a standard 25 mm fan. */
const FAN_DEPTH_MM = 25;

/**
 * The fans of a radiator, in a row along the long edge of its footprint, on the face toward the case interior (`axis` points into the case).
 * Returns each fan's footprint box and its square frame size.
 */
export function radiatorFanBoxes(box: { min: Vec3; size: Vec3 }, axis: Vec3, count: number): { min: Vec3; size: Vec3; frame: number }[] {
  const k = [0, 1, 2].reduce((best, a) => (Math.abs(axis[a]) > Math.abs(axis[best]) ? a : best), 0);
  const plane = [0, 1, 2].filter(a => a !== k);
  const along = box.size[plane[0]] >= box.size[plane[1]] ? plane[0] : plane[1];
  const across = plane[0] === along ? plane[1] : plane[0];
  const frame = Math.min(box.size[across], box.size[along] / count);
  return Array.from({ length: count }, (_, i) => {
    const min: Vec3 = [0, 0, 0];
    const size: Vec3 = [0, 0, 0];
    size[k] = FAN_DEPTH_MM;
    size[along] = size[across] = frame;
    min[k] = axis[k] > 0 ? box.min[k] + box.size[k] : box.min[k] - FAN_DEPTH_MM;
    min[along] = box.min[along] + (box.size[along] * (i + 0.5)) / count - frame / 2;
    min[across] = box.min[across] + box.size[across] / 2 - frame / 2;
    return { min, size, frame };
  });
}

/** Key of the `i`th fan of a radiator slot: the slot's own key first, then `key#i`, as the pressure model and the flow grid name them. */
export const radiatorFanKey = (slotKey: string, i: number): string => (i === 0 ? slotKey : `${slotKey}#${i}`);

/** The drawn fans of a radiator slot, one entry per fan, each a taken fan slot of its own size. */
export function radiatorSlotFans(slot: CaseFanSlot): { slot: CaseFanSlot; box: CaseBox }[] {
  if (slot.taken !== 'radiator' || !slot.box || !slot.axis) return [];
  const count = slot.radiator?.fanCount ?? inferRadiatorFans(slot.size).count;
  return radiatorFanBoxes(slot.box, slot.axis, count).map((b, i) => ({
    slot: { ...slot, key: radiatorFanKey(slot.key, i), size: Math.round(b.frame), index: i, taken: 'fan' as const, box: { min: b.min, size: b.size }, radiator: undefined },
    box: { slot: 'fan', role: 'part', min: b.min, size: b.size },
  }));
}

/**
 * Fan slots for an AIO radiator the case's own mounts do not hold: Build keeps it as a cooler box whose rings show on both faces.
 * Named `rad:<position>:N`; the position follows the box's place in the case.
 */
export function looseRadiatorSlots(boxes: readonly CaseBox[], size: Vec3): CaseFanSlot[] {
  const extents: Vec3 = [size[0], size[2], size[1]];
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'cooler' || !box.fans?.bothSides || !box.fans.count) continue;
    const k = { x: 0, y: 1, z: 2 }[box.fans.axis];
    const high = box.min[k] + box.size[k] / 2 > extents[k] / 2;
    const position = [['front', 'rear'], ['bottom', 'top'], ['left', 'right']][k][high ? 1 : 0];
    const axis: Vec3 = [0, 0, 0];
    axis[k] = high ? -1 : 1;
    radiatorFanBoxes(box, axis, box.fans.count).forEach((b, i) => {
      out.push({ key: `rad:${position}:${out.length}`, position, size: Math.round(b.frame), index: i, taken: 'fan', box: { min: b.min, size: b.size }, axis });
    });
  }
  return out;
}
