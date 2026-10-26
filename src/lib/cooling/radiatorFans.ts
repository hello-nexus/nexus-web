import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';

/** Depth of a drawn radiator fan along its axis, mm: a standard fan's thickness. */
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

/** Key of the `i`th fan of the radiator, whatever case mount holds it. */
export const radiatorFanKey = (i: number): string => `rad:${i}`;

/**
 * Fan slots for the AIO radiator, built from its cooler box (a box that shows rings on both faces), keyed `rad:0..N-1` independent of the mount.
 * The fan count comes once from the box, the specs from the case slots the radiator covers, and `mount` names the position (else the box's own face).
 */
export function radiatorFanSlots(boxes: readonly CaseBox[], size: Vec3, covered: readonly CaseFanSlot[], mount?: string): CaseFanSlot[] {
  const extents: Vec3 = [size[0], size[2], size[1]];
  const spec = covered.find(s => s.taken === 'radiator' && s.radiator)?.radiator;
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'cooler' || !box.fans?.bothSides || !box.fans.count) continue;
    // Push-pull: the maker's fan total is twice the fans per face, and the two in series add their static pressure.
    const series = spec?.fanCount === 2 * box.fans.count ? 2 : 1;
    const fan = spec ? { rpmMax: spec.fanRpmMax, airflowCfm: spec.fanAirflowCfm, staticPressureMmH2O: spec.fanStaticPressureMmH2O === undefined ? undefined : spec.fanStaticPressureMmH2O * series } : undefined;
    const k = { x: 0, y: 1, z: 2 }[box.fans.axis];
    const high = box.min[k] + box.size[k] / 2 > extents[k] / 2;
    const position = mount ?? [['front', 'rear'], ['bottom', 'top'], ['left', 'right']][k][high ? 1 : 0];
    const axis: Vec3 = [0, 0, 0];
    axis[k] = high ? -1 : 1;
    radiatorFanBoxes(box, axis, box.fans.count).forEach((b, i) => {
      out.push({ key: radiatorFanKey(out.length), position, size: Math.round(b.frame), index: i, taken: 'fan', box: { min: b.min, size: b.size }, axis, ...(fan ? { fan } : {}) });
    });
  }
  return out;
}
