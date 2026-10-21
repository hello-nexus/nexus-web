import { setLightingDeviceControlled, type LightingDevice } from '../../../api/lighting';
import { lightingGroupName } from '../../../hooks/useConflictDevices';

const OPENRGB_ID_PREFIX = 'openrgb-';

/** One physical OpenRGB device: every lighting card (zone, header) it owns folded into a row. */
export interface OpenRgbDevice {
  key: string;
  /** The controller id the icon look keys on. */
  deviceId: string;
  name: string;
  iconType?: string;
  cardIds: string[];
  /** On when any of its cards is controlled; a card without the flag counts as controlled. */
  controlled: boolean;
  conflictAppIds: string[];
}

/**
 * Groups the service's lighting cards by owning device. Cards another
 * provider owns (a curated handler's, or any first-party device) are skipped: the Devices list already renders those rows.
 */
export function groupOpenRgbDevices(cards: readonly LightingDevice[]): OpenRgbDevice[] {
  const byDevice = new Map<string, LightingDevice[]>();
  for (const card of cards) {
    if (card.controlHandlerId) continue;
    // A motherboard's ports each carry their own deviceId; parentDeviceId is the controller they share.
    const deviceId = card.parentDeviceId || card.deviceId || card.id;
    // The list merges every lighting provider; only OpenRGB controller ids (live and held-off snapshots) start with this.
    if (!deviceId.startsWith(OPENRGB_ID_PREFIX)) continue;
    const bucket = byDevice.get(deviceId);
    if (bucket) bucket.push(card);
    else byDevice.set(deviceId, [card]);
  }
  const groups: OpenRgbDevice[] = [];
  for (const [deviceId, members] of byDevice) {
    groups.push({
      key: `openrgb:${deviceId}`,
      deviceId,
      name: members.find(c => c.parentName)?.parentName
        ?? (members.length === 1 ? members[0].deviceName : null)
        ?? lightingGroupName(members, deviceId),
      iconType: members[0].iconType ?? members[0].type,
      cardIds: members.map(c => c.id),
      controlled: members.some(c => c.controlled !== false),
      conflictAppIds: [...new Set(members.flatMap(c => c.conflictAppIds ?? []))],
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.key.localeCompare(b.key));
}

/** OpenRGB detects devices only while the Lighting feature is on and its daemon is up. */
export function openRgbNoticeShown(featureOn: boolean, daemonUp: boolean): boolean {
  return !featureOn || !daemonUp;
}

/** Sets Nexus Control on the given cards through the Lighting page's endpoint. Resolves false when any write failed. */
export async function setOpenRgbCardsControlled(ids: readonly string[], controlled: boolean): Promise<boolean> {
  const results = await Promise.allSettled(ids.map(id => setLightingDeviceControlled(id, controlled)));
  return results.every(r => r.status === 'fulfilled' && r.value !== null && r.value !== false);
}
