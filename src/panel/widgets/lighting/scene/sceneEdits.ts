import type { SceneBinding, Vec3 } from '../../../../api/lightingScene';
import type { SceneEdit } from './useLightingScene';

/** Pure scene edits: each returns the next scene without touching the one passed in. */

export function placeDevice(s: SceneEdit, deviceId: string, objectId: string, anchorId: string, append: boolean): SceneEdit {
  const existing = s.bindings.find(b => b.deviceId === deviceId);
  if (existing && append) {
    if (existing.targets.some(t => t.objectId === objectId && t.anchorId === anchorId)) return s;
    const next: SceneBinding = { ...existing, targets: [...existing.targets, { objectId, anchorId }] };
    return { ...s, bindings: s.bindings.map(b => (b === existing ? next : b)) };
  }
  const binding: SceneBinding = { deviceId, targets: [{ objectId, anchorId }], rotation: existing?.rotation ?? 0, flip: existing?.flip ?? false };
  return { ...s, bindings: [...s.bindings.filter(b => b.deviceId !== deviceId), binding] };
}

/** A quarter turn clockwise of the device's map on its surfaces. */
export function rotateBinding(s: SceneEdit, deviceId: string): SceneEdit {
  return { ...s, bindings: s.bindings.map(b => (b.deviceId === deviceId ? { ...b, rotation: (b.rotation + 90) % 360 } : b)) };
}

export function flipBinding(s: SceneEdit, deviceId: string): SceneEdit {
  return { ...s, bindings: s.bindings.map(b => (b.deviceId === deviceId ? { ...b, flip: !b.flip } : b)) };
}

/** Where an object stands on the desk and which way it faces (degrees, counter-clockwise from above). */
export function moveObject(s: SceneEdit, objectId: string, position: Vec3, yaw: number): SceneEdit {
  return { ...s, objects: s.objects.map(o => (o.id === objectId ? { ...o, position, yaw } : o)) };
}
