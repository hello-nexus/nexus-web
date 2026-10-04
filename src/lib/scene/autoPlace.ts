import type { LightingDevice } from '../../api/lighting';
import type { SceneBinding, SceneObject } from './sceneTypes';

export type DeviceRole = 'keyboard' | 'mouse' | 'mousepad' | 'headphones' | 'speaker' | 'ram' | 'gpu';

/**
 * What a device reports itself to be, from the service's type tags only. A name is the user's or a guess, and fans,
 * strips and headers can sit anywhere, so those return null and wait for the user to place them.
 */
export function deviceRole(d: LightingDevice): DeviceRole | null {
  const tags = `${d.iconType ?? ''} ${d.type ?? ''}`.toLowerCase();
  if (/\bkeyboard\b/.test(tags)) return 'keyboard';
  if (/mousemat|mousepad/.test(tags)) return 'mousepad';
  if (/\bmouse\b/.test(tags)) return 'mouse';
  if (/headset|headphone/.test(tags)) return 'headphones';
  if (/speaker/.test(tags)) return 'speaker';
  if (/\bdram\b/.test(tags)) return 'ram';
  if (/\bgpu\b/.test(tags)) return 'gpu';
  return null;
}

// Desk object kinds (Build's catalog categories) and case spot kinds each role belongs on.
const OBJECT_KINDS: Partial<Record<DeviceRole, string[]>> = {
  keyboard: ['keyboard'],
  mouse: ['mouse'],
  mousepad: ['mousepad'],
  headphones: ['headphones'],
  speaker: ['speaker'],
};
const ANCHOR_KINDS: Partial<Record<DeviceRole, string>> = { ram: 'ram', gpu: 'gpu' };

export interface AutoPlaceResult {
  bindings: SceneBinding[];
  placed: string[];
}

/**
 * Places the devices whose spot is certain: a role with exactly one unplaced device and exactly one free spot that
 * takes it. Everything else is left for the user; nothing is added to the scene.
 */
export function autoPlace(objects: SceneObject[], bindings: SceneBinding[], devices: LightingDevice[]): AutoPlaceResult {
  const taken = new Set(bindings.flatMap(b => b.targets.map(t => `${t.objectId}\n${t.anchorId}`)));
  const bound = new Set(bindings.map(b => b.deviceId));
  const byRole = new Map<DeviceRole, LightingDevice[]>();
  for (const d of devices) {
    if (bound.has(d.id) || d.controlled === false || d.ledCount <= 0) continue;
    const role = deviceRole(d);
    if (role) byRole.set(role, [...(byRole.get(role) ?? []), d]);
  }
  const next = [...bindings];
  const placed: string[] = [];
  for (const [role, candidates] of byRole) {
    if (candidates.length !== 1) continue;
    const objectKinds = OBJECT_KINDS[role];
    const anchorKind = ANCHOR_KINDS[role];
    const spots = objects.flatMap(o => o.anchors
      .filter(a => (objectKinds ? objectKinds.includes(o.kind) : a.kind === anchorKind) && !taken.has(`${o.id}\n${a.id}`))
      .map(a => ({ objectId: o.id, anchorId: a.id })));
    if (spots.length !== 1) continue;
    next.push({ deviceId: candidates[0].id, targets: [spots[0]], rotation: 0, flip: false });
    placed.push(candidates[0].id);
  }
  return { bindings: next, placed };
}
