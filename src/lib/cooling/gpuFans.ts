import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';

/** Fan slots for the fans each graphics card carries, placed as Build draws them: in a row along the card's longer face edge, each ring centred in its share, on the card's `side` face (`min` when unset). */
export function gpuFanSlots(boxes: readonly CaseBox[]): CaseFanSlot[] {
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'gpu' || box.role !== 'part' || !box.fans?.count) continue;
    const { axis, count, diameter, side } = box.fans;
    const k = { x: 0, y: 1, z: 2 }[axis];
    const plane = [0, 1, 2].filter(a => a !== k);
    const along = box.size[plane[0]] >= box.size[plane[1]] ? plane[0] : plane[1];
    const across = plane[0] === along ? plane[1] : plane[0];
    // The fan frame is a little wider than the drawn ring, as for the case's own mounts.
    const frame = diameter + 6;
    for (let i = 0; i < count; i++) {
      const min: Vec3 = [0, 0, 0];
      const size: Vec3 = [0, 0, 0];
      min[k] = box.min[k];
      size[k] = box.size[k];
      size[along] = size[across] = frame;
      min[along] = box.min[along] + (box.size[along] * (i + 0.5)) / count - frame / 2;
      min[across] = box.min[across] + box.size[across] / 2 - frame / 2;
      const into: Vec3 = [0, 0, 0];
      // The fans sit on one face of the card and draw air in through it.
      into[k] = side === 'max' ? -1 : 1;
      out.push({ key: `gpu:fan:${out.length}`, position: 'gpu', size: Math.round(frame), index: out.length, taken: 'fan', box: { min, size }, axis: into });
    }
  }
  return out;
}
