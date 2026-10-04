import type { LightingDevice } from '../../api/lighting';
import type { SceneBinding, SceneObject } from '../../api/lightingScene';
import { newDeskObject, type DeskKind } from './deskCatalog';

export type DeviceRole = 'keyboard' | 'mouse' | 'mousepad' | 'headset' | 'speaker' | 'fan' | 'ram' | 'gpu' | 'pump' | 'board' | 'strip';

/** What a device most likely is, from the service's type tags and, failing those, its name. */
export function deviceRole(d: LightingDevice): DeviceRole | null {
  const tags = `${d.iconType ?? ''} ${d.type ?? ''}`.toLowerCase();
  const name = d.name.toLowerCase();
  if (/\bkeyboard\b/.test(tags)) return 'keyboard';
  if (/\bmouse\b/.test(tags)) return 'mouse';
  if (/mousemat|mousepad/.test(tags)) return 'mousepad';
  if (/headset/.test(tags)) return 'headset';
  if (/speaker/.test(tags)) return 'speaker';
  if (/\bfan\b/.test(tags) || /\bfans?\b/.test(name)) return 'fan';
  if (/\bdram\b/.test(tags) || /\b(ram|dimm|memory)\b/.test(name)) return 'ram';
  if (/\bgpu\b/.test(tags)) return 'gpu';
  if (/\b(cooler|aio)\b/.test(tags)) return 'pump';
  if (/motherboard/.test(tags)) return /argb|header|addressable|jrainbow|d_led|rgb_led/.test(name) ? 'strip' : 'board';
  if (/strip/.test(tags)) return 'strip';
  return null;
}

const DESK_ROLE: Partial<Record<DeviceRole, DeskKind[]>> = {
  keyboard: ['keyboard'],
  mouse: ['mouse'],
  mousepad: ['mousepad', 'deskmat'],
  headset: ['headset'],
  speaker: ['speaker'],
};

// Case surfaces each role may take, best first.
const CASE_ROLE: Partial<Record<DeviceRole, string[]>> = {
  fan: ['fan'],
  ram: ['ram'],
  gpu: ['gpu'],
  pump: ['pump', 'fan'],
  board: ['board'],
  strip: ['strip', 'panel'],
};

// Fan mounts in the order a fan is most likely to sit in them.
const FAN_ORDER = ['front', 'top', 'rear', 'bottom', 'side', 'left', 'right', 'psu-shroud'];

function fanRank(anchorId: string): number {
  const position = anchorId.split(':')[1] ?? '';
  const i = FAN_ORDER.findIndex(p => position.startsWith(p));
  return i < 0 ? FAN_ORDER.length : i;
}

export interface AutoPlaceResult {
  objects: SceneObject[];
  bindings: SceneBinding[];
  placed: string[];
  skipped: string[];
}

/** Places every unplaced device it can recognise: peripherals on desk objects (made when missing), case parts on free case surfaces. */
export function autoPlace(objects: SceneObject[], bindings: SceneBinding[], devices: LightingDevice[]): AutoPlaceResult {
  const nextObjects = [...objects];
  const nextBindings = [...bindings];
  const taken = new Set(bindings.flatMap(b => b.targets.map(t => `${t.objectId}\n${t.anchorId}`)));
  const bound = new Set(bindings.map(b => b.deviceId));
  const placed: string[] = [];
  const skipped: string[] = [];
  const caseObj = nextObjects.find(o => o.kind === 'case');

  const bind = (deviceId: string, objectId: string, anchorId: string) => {
    nextBindings.push({ deviceId, targets: [{ objectId, anchorId }], rotation: 0, flip: false });
    taken.add(`${objectId}\n${anchorId}`);
    placed.push(deviceId);
  };

  for (const d of devices) {
    if (bound.has(d.id) || d.controlled === false) continue;
    const role = deviceRole(d);
    const deskKinds = role ? DESK_ROLE[role] : undefined;
    if (deskKinds) {
      const free = nextObjects.find(o => deskKinds.includes(o.kind as DeskKind) && o.anchors.some(a => !taken.has(`${o.id}\n${a.id}`)));
      const obj = free ?? newDeskObject(deskKinds[0], nextObjects);
      if (!free) nextObjects.push(obj);
      const anchor = obj.anchors.find(a => !taken.has(`${obj.id}\n${a.id}`))!;
      bind(d.id, obj.id, anchor.id);
      continue;
    }
    const kinds = role ? CASE_ROLE[role] : undefined;
    if (!kinds || !caseObj) {
      skipped.push(d.id);
      continue;
    }
    const candidates = kinds.flatMap(kind =>
      caseObj.anchors
        .filter(a => a.kind === kind && !taken.has(`${caseObj.id}\n${a.id}`))
        .sort((a, b) => (kind === 'fan' ? fanRank(a.id) - fanRank(b.id) : 0)));
    if (candidates.length === 0) {
      skipped.push(d.id);
      continue;
    }
    bind(d.id, caseObj.id, candidates[0].id);
  }
  return { objects: nextObjects, bindings: nextBindings, placed, skipped };
}
