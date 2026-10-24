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
 * The pick a click or hover stands for when several things lie under it, nearest first: the first one that names a
 * device. A bound surface wins over its own object's body however near the body is (the case glass over a strip),
 * but a nearer object that names a device beats a bound surface behind it (a keyboard over the deskmat). Free
 * surfaces and unbound objects are looked past. Null when nothing under it names a device.
 */
export function pickForStack(bindings: SceneBinding[], stack: ScenePick[]): ScenePick | null {
  const seen = new Set<string>();
  for (const pick of stack) {
    if (seen.has(pick.objectId)) continue;
    seen.add(pick.objectId);
    const own = stack.filter(p => p.objectId === pick.objectId);
    const hit = own.find(p => p.kind === 'anchor' && deviceForPick(bindings, p)) ?? own.find(p => p.kind === 'object' && deviceForPick(bindings, p));
    if (hit) return hit;
  }
  return null;
}

export function deviceForStack(bindings: SceneBinding[], stack: ScenePick[]): string | null {
  return deviceForPick(bindings, pickForStack(bindings, stack));
}

/**
 * Bindings with each target whose object is gone pointed at the object that took its place. An older export named
 * a desk item `<kind>-<n>`; the shared setup now names it by its own id, so the binding still targets the old name.
 * Only a scene with exactly one object of that kind heals, and only while that object holds no binding of its own;
 * with none or several the binding stays as it is.
 */
export function healBindings(objects: SceneObject[], bindings: SceneBinding[]): SceneBinding[] {
  const known = new Set(objects.map(o => o.id));
  const held = new Set(bindings.flatMap(b => b.targets.map(t => t.objectId)));
  let changed = false;
  const out = bindings.map(b => {
    const targets = b.targets.map(t => {
      if (known.has(t.objectId)) return t;
      const kind = /^(.+)-\d+$/.exec(t.objectId)?.[1];
      const ofKind = kind ? objects.filter(o => o.kind === kind) : [];
      const heir = ofKind.length === 1 ? ofKind[0] : undefined;
      if (!heir || held.has(heir.id) || !heir.anchors.some(a => a.id === t.anchorId)) return t;
      changed = true;
      held.add(heir.id);
      return { ...t, objectId: heir.id };
    });
    return targets.some((t, i) => t !== b.targets[i]) ? { ...b, targets } : b;
  });
  return changed ? out : bindings;
}
