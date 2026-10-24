import type { SceneObject } from '../../api/lightingScene';
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

/** Resolved objects with only the placed ones moved; height, size, anchors and everything else stay. */
export function applyPlacements(objects: SceneObject[], places: PcSetupPlacement[]): SceneObject[] {
  return objects.map(o => {
    const place = places.find(p => objectFor(objects, p.id) === o);
    return place ? { ...o, position: [place.x, o.position[1], place.z], yaw: place.yaw } : o;
  });
}

/** Places whose item the record still holds with a resolved object. */
export function survivingPlaces(setup: PcSetup, places: PcSetupPlacement[]): PcSetupPlacement[] {
  return places.filter(p => {
    const obj = objectFor(setup.resolved.objects, p.id);
    return !!obj && placementId(setup, obj) === p.id;
  });
}
