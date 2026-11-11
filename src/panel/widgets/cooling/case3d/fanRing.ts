import { Vector3 } from 'three';
import type { CaseBox, CaseFanSlot } from '../../../../lib/cooling/caseLayout';

type Axis = 'x' | 'y' | 'z';

const UNIT = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const;

export function ringAxisOf(box: CaseBox): Axis {
  if (box.fans) return box.fans.axis;
  const [x, y, z] = box.size;
  return x <= y && x <= z ? 'x' : y <= z ? 'y' : 'z';
}

/**
 * A card's fan slot box spans the whole card, so its center is inside the card's solid, which hides a ring drawn there.
 * The distance along the ring axis from the box center to the card face the fan draws air in through; 0 for every other slot, whose box is the fan itself.
 */
export function ringFaceShift(slotKey: string, thickness: number, into: number): number {
  return slotKey.startsWith('gpu:') && into !== 0 ? -Math.sign(into) * (thickness / 2) : 0;
}

export interface FanRingFrame {
  /** The box's center, where the fan's group sits. */
  boxCenter: Vector3;
  axis: Axis;
  axisIndex: 0 | 1 | 2;
  faceShift: number;
  /** The drawn ring's center in layout space: the box center moved along the ring axis by the face shift, turned with the box. */
  center: Vector3;
}

/** Where a fan's ring is drawn. The renderer builds the ring from this and the labels anchor to `center`, so the two cannot diverge. */
export function fanRingFrame(slot: Pick<CaseFanSlot, 'key' | 'axis'>, box: CaseBox): FanRingFrame {
  const boxCenter = new Vector3(box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2);
  const given = slot.axis ? new Vector3(...slot.axis) : null;
  const rotationY = box.rotationY ?? 0;
  const localGiven = given?.clone().applyAxisAngle(UNIT.y, -rotationY) ?? null;
  const axis: Axis = localGiven
    ? (['x', 'y', 'z'] as const).reduce((best, k) => (Math.abs(localGiven[k]) > Math.abs(localGiven[best]) ? k : best), 'x' as Axis)
    : ringAxisOf(box);
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const faceShift = ringFaceShift(slot.key, box.size[axisIndex], localGiven ? localGiven[axis] : 0);
  const center = boxCenter.clone().addScaledVector(UNIT[axis].clone().applyAxisAngle(UNIT.y, rotationY), faceShift);
  return { boxCenter, axis, axisIndex, faceShift, center };
}
