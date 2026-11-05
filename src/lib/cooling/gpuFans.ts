import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';

// Copied from nexus-build `gpuFanOffsets` (src/lib/pcLayout.ts), a separate repo: keep the two in step.
const GPU_BRACKET_END = 20;

/** Each card fan's ring size and center measured from the bracket end: the sizes packed from it with the leftover length shared evenly, and shrunk together when they outrun the usable length. */
function gpuFanOffsets(length: number, sizes: number[]): { sizes: number[]; offsets: number[] } {
  const usable = length - GPU_BRACKET_END;
  const sum = sizes.reduce((a, b) => a + b, 0);
  const scale = sum > usable ? usable / sum : 1;
  const gap = Math.max(0, (usable - sum) / (sizes.length + 1));
  let cursor = GPU_BRACKET_END;
  const scaled = sizes.map(size => size * scale);
  const offsets = scaled.map(size => {
    cursor += gap + size;
    return cursor - size / 2;
  });
  return { sizes: scaled, offsets };
}

/** Fan slots for the fans each graphics card carries, placed as Build draws them: in a row along the card's longer face edge, each ring centered in its share (`flowThrough` indices count from the bracket end), on the card's `side` face (`min` when unset). */
export function gpuFanSlots(boxes: readonly CaseBox[]): CaseFanSlot[] {
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'gpu' || box.role !== 'part' || !box.fans?.count) continue;
    const { axis, count, diameter, side, sizes, faces, flowThrough, bracket } = box.fans;
    const k = { x: 0, y: 1, z: 2 }[axis];
    const plane = [0, 1, 2].filter(a => a !== k);
    // The card's length runs along the bracket's axis when Build says so, else along its longer face edge with the bracket at the max end.
    const along = bracket ? { x: 0, y: 1, z: 2 }[bracket.axis] : box.size[plane[0]] >= box.size[plane[1]] ? plane[0] : plane[1];
    const fromMax = (bracket?.side ?? 'max') === 'max';
    const across = plane[0] === along ? plane[1] : plane[0];
    const packed = sizes ? gpuFanOffsets(box.size[along], sizes) : null;
    for (let i = 0; i < count; i++) {
      // The fan frame is a little wider than the drawn ring, as for the case's own mounts.
      const frame = (packed?.sizes[i] ?? diameter) + 6;
      const min: Vec3 = [0, 0, 0];
      const size: Vec3 = [0, 0, 0];
      min[k] = box.min[k];
      size[k] = box.size[k];
      size[along] = size[across] = frame;
      // Fans count from the bracket end, as Build draws them.
      const fromBracketEnd = packed ? packed.offsets[i] : box.size[along] * (1 - (fromMax ? i + 0.5 : count - i - 0.5) / count);
      const center = fromMax ? box.min[along] + box.size[along] - fromBracketEnd : box.min[along] + fromBracketEnd;
      min[along] = center - frame / 2;
      min[across] = box.min[across] + box.size[across] / 2 - frame / 2;
      const index = packed ? i : fromMax ? count - 1 - i : i;
      const through = !!flowThrough?.includes(index);
      const into: Vec3 = [0, 0, 0];
      // The fans sit on one face of the card and draw air in through it.
      // A backplate fan sits on the opposite face and draws air the other way.
      into[k] = (side === 'max') !== (faces?.[i] === 'backplate') ? -1 : 1;
      out.push({ key: `gpu:fan:${out.length}`, position: 'gpu', size: Math.round(frame), index: out.length, taken: 'fan', box: { min, size }, axis: into, ...(through ? { flowThrough: true } : {}) });
    }
  }
  return out;
}
