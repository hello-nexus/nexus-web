import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';
import { FAN_DEPTH_MM } from './radiatorFans';

/**
 * Fan slots for the fans an air cooler carries, placed as Build draws its ring: in a row along the longer edge of the face the axis crosses, on the cooler's `side` face.
 * `stack` fans sit in series along the axis (a dual tower). An air cooler box has no `bothSides`; an AIO radiator box does and is handled by `radiatorFanSlots`.
 * The box's own airflow is carried on each slot; a fan without one takes the size default when the slot is modeled.
 */
export function coolerFanSlots(boxes: readonly CaseBox[]): CaseFanSlot[] {
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'cooler' || box.role !== 'part' || box.fans?.bothSides || !box.fans?.count) continue;
    const { axis, count, diameter, side, stack = 1, airflowCfm } = box.fans;
    const k = { x: 0, y: 1, z: 2 }[axis];
    const plane = [0, 1, 2].filter(a => a !== k);
    const along = box.size[plane[0]] >= box.size[plane[1]] ? plane[0] : plane[1];
    const across = plane[0] === along ? plane[1] : plane[0];
    const frame = diameter + 6;
    const depth = FAN_DEPTH_MM;
    const into: Vec3 = [0, 0, 0];
    into[k] = side === 'max' ? -1 : 1;
    for (let s = 0; s < stack; s++) {
      for (let i = 0; i < count; i++) {
        const min: Vec3 = [0, 0, 0];
        const size: Vec3 = [0, 0, 0];
        size[k] = depth;
        size[along] = size[across] = frame;
        // The first fan is centered on the cooler's face, where Build draws its ring, so the cooler's own solid never hides it; the rest sit deeper along the axis.
        const center = side === 'max' ? box.min[k] + box.size[k] - (box.size[k] * s) / stack : box.min[k] + (box.size[k] * s) / stack;
        min[k] = center - depth / 2;
        min[along] = box.min[along] + (box.size[along] * (i + 0.5)) / count - frame / 2;
        min[across] = box.min[across] + box.size[across] / 2 - frame / 2;
        out.push({
          key: `cpu:fan:${out.length}`,
          position: 'cpu',
          size: Math.round(frame),
          index: out.length,
          taken: 'fan',
          box: { min, size },
          axis: into,
          ...(airflowCfm ? { fan: { airflowCfm } } : {}),
        });
      }
    }
  }
  return out;
}
