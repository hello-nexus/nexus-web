import type { SceneBinding } from '../../api/lightingScene';
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
