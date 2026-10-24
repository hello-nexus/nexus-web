import type { SceneBinding, SceneObject } from '../../api/lightingScene';
import type { ScenePick } from './sceneRenderer';

/**
 * The device a click in the scene stands for. A hit on a spot (the surface an LED map lies on) names the device
 * bound there; a hit on an object's body, where no spot was hit, names the first device bound anywhere on it, in
 * binding order. Null when nothing is bound there, so the click keeps selecting the object.
 */
export function deviceForPick(bindings: SceneBinding[], pick: ScenePick | null): string | null {
  if (!pick) return null;
  const hit = bindings.find(b => b.targets.some(t => t.objectId === pick.objectId && (pick.kind === 'object' || t.anchorId === pick.anchorId)));
  return hit?.deviceId ?? null;
}

/**
 * The device a click stands for when several things lie under it, nearest first. A surface that names a device
 * wins over any object body; a free surface or an unbound object is looked past, so one in front of a bound
 * surface (a monitor drawn before the case) does not swallow the click. Null when nothing under it names a device.
 */
export function deviceForStack(bindings: SceneBinding[], stack: ScenePick[]): string | null {
  for (const kind of ['anchor', 'object'] as const) {
    for (const pick of stack) {
      if (pick.kind !== kind) continue;
      const id = deviceForPick(bindings, pick);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Bindings with each target whose object is gone pointed at the object that took its place. An older export named
 * a desk item `<kind>-<n>`; the shared setup now names it by its own id, so the binding still targets the old name.
 * The n-th object of that kind takes the target, only while it holds no binding of its own.
 */
export function healBindings(objects: SceneObject[], bindings: SceneBinding[]): SceneBinding[] {
  const known = new Set(objects.map(o => o.id));
  const held = new Set(bindings.flatMap(b => b.targets.map(t => t.objectId)));
  let changed = false;
  const out = bindings.map(b => {
    const targets = b.targets.map(t => {
      if (known.has(t.objectId)) return t;
      const m = /^(.+)-(\d+)$/.exec(t.objectId);
      const heir = m ? objects.filter(o => o.kind === m[1])[Number(m[2]) - 1] : undefined;
      if (!heir || held.has(heir.id) || !heir.anchors.some(a => a.id === t.anchorId)) return t;
      changed = true;
      return { ...t, objectId: heir.id };
    });
    return targets.some((t, i) => t !== b.targets[i]) ? { ...b, targets } : b;
  });
  return changed ? out : bindings;
}
