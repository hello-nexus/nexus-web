import type { SceneObject } from '../../api/lightingScene';
import { rotateYaw } from './sceneMath';
import type { PcSetup, PcSetupPlacement } from '../../api/pcSetup';

const CASE_ID = 'case';

/** The id the placements route knows an object by, or null when the record has no such case or item. */
export function placementId(setup: PcSetup, obj: SceneObject): string | null {
  if (obj.kind === 'case') return CASE_ID;
  return setup.items.some(i => i.id === obj.id) ? obj.id : null;
}

/** The scene object a placement id names. */
function objectFor(objects: SceneObject[], id: string): SceneObject | undefined {
  return id === CASE_ID ? objects.find(o => o.kind === 'case') : objects.find(o => o.id === id);
}

/** Whether Lighting may move this object: the record holds resolved objects and knows the item. */
export function isMovable(setup: PcSetup | null, rev: number, obj: SceneObject): boolean {
  return !!setup && rev > 0 && setup.resolved.objects.length > 0 && placementId(setup, obj) !== null;
}

/** The pose an object has now, as a placement. */
export function placementOf(id: string, obj: SceneObject): PcSetupPlacement {
  return { id, x: obj.position[0], z: obj.position[2], yaw: obj.yaw };
}

const RETURN_SUFFIX = '.return';

/** Resolved objects with only the placed ones moved, and a desk's `<id>.return` wing carried along rigidly; height, size, anchors and everything else stay. */
export function applyPlacements(objects: SceneObject[], places: PcSetupPlacement[]): SceneObject[] {
  return objects.map(o => {
    const own = places.find(p => objectFor(objects, p.id) === o);
    if (own) return { ...o, position: [own.x, o.position[1], own.z], yaw: own.yaw };
    if (!o.id.endsWith(RETURN_SUFFIX)) return o;
    const deskId = o.id.slice(0, -RETURN_SUFFIX.length);
    const place = places.find(p => p.id === deskId);
    const desk = objects.find(d => d.id === deskId);
    if (!place || !desk) return o;
    const rel = rotateYaw([o.position[0] - desk.position[0], 0, o.position[2] - desk.position[2]], place.yaw - desk.yaw);
    return { ...o, position: [place.x + rel[0], o.position[1], place.z + rel[2]], yaw: o.yaw + (place.yaw - desk.yaw) };
  });
}

/** Places whose item the record still holds with a resolved object. */
export function survivingPlaces(setup: PcSetup, places: PcSetupPlacement[]): PcSetupPlacement[] {
  return places.filter(p => {
    const obj = objectFor(setup.resolved.objects, p.id);
    return !!obj && placementId(setup, obj) === p.id;
  });
}
