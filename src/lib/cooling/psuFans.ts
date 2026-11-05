import type { CaseBox, CaseFanSlot, Vec3 } from './caseLayout';
import { FAN_DEPTH_MM } from './radiatorFans';

/** Speed a power supply's fan is simulated at when nothing is bound to it, rpm. A PSU fan stays slow or stopped at the light and medium loads of a gaming PC; this is a stand-in, not a measured value. */
export const PSU_SIM_RPM = 800;

export const PSU_FAN_PREFIX = 'psu:fan:';
export const isPsuSlotKey = (key: string): boolean => key.startsWith(PSU_FAN_PREFIX);

/**
 * Fan slots for the fan a power supply carries, placed as Build draws its ring: centered on the PSU's `side` face, which the fan draws air in through.
 * Only a PSU whose box names its grille end (`exhaust`) gets one: without that the air has no way out, so the layout reads as before.
 * A PSU fan takes the size default when modeled; `ventFed` marks one over a documented case vent.
 */
export function psuFanSlots(boxes: readonly CaseBox[]): CaseFanSlot[] {
  const out: CaseFanSlot[] = [];
  for (const box of boxes) {
    if (box.slot !== 'psu' || box.role !== 'part' || !box.fans?.count || !box.fans.exhaust) continue;
    const { axis, diameter, side } = box.fans;
    const k = { x: 0, y: 1, z: 2 }[axis];
    const lateral = [0, 1, 2].filter(a => a !== k);
    const frame = diameter + 6;
    const min: Vec3 = [0, 0, 0];
    const size: Vec3 = [0, 0, 0];
    size[k] = FAN_DEPTH_MM;
    for (const a of lateral) {
      size[a] = frame;
      min[a] = box.min[a] + box.size[a] / 2 - frame / 2;
    }
    // The ring sits on the face, so the PSU's own solid never hides it.
    min[k] = (side === 'max' ? box.min[k] + box.size[k] : box.min[k]) - FAN_DEPTH_MM / 2;
    const into: Vec3 = [0, 0, 0];
    into[k] = side === 'max' ? -1 : 1;
    out.push({ key: `${PSU_FAN_PREFIX}${out.length}`, position: 'psu', size: Math.round(frame), index: out.length, taken: 'fan', box: { min, size }, axis: into, ...(box.fans.draws === 'outside' ? { ventFed: true } : {}) });
  }
  return out;
}
