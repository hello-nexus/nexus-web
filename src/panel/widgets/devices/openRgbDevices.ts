import { setLightingDeviceControlled, type LightingDevice } from '../../../api/lighting';
import { lightingGroupName } from '../../../hooks/useConflictDevices';

/** One physical OpenRGB device: every lighting card (zone, header) it owns folded into a row. */
export interface OpenRgbDevice {
  key: string;
  /** The owning device id the icon look keys on. */
  deviceId: string;
  name: string;
  iconType?: string;
  cardIds: string[];
  /** On when any of its cards is controlled; a card without the flag counts as controlled. */
  controlled: boolean;
  conflictAppIds: string[];
}

/**
 * Groups the service's lighting cards by owning device. Cards a curated handler
 * claims are skipped: the Devices list already renders that handler's own row.
 */
export function groupOpenRgbDevices(cards: readonly LightingDevice[]): OpenRgbDevice[] {
  const byDevice = new Map<string, LightingDevice[]>();
  for (const card of cards) {
    if (card.controlHandlerId) continue;
    const deviceId = card.deviceId || card.id;
    const bucket = byDevice.get(deviceId);
    if (bucket) bucket.push(card);
    else byDevice.set(deviceId, [card]);
  }
  const groups: OpenRgbDevice[] = [];
  for (const [deviceId, members] of byDevice) {
    groups.push({
      key: `openrgb:${deviceId}`,
      deviceId,
      name: members.find(c => c.deviceName)?.deviceName ?? lightingGroupName(members, deviceId),
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

/** Sets Nexus Control on every card of the device through the Lighting page's endpoint. */
export async function setOpenRgbDeviceControlled(device: OpenRgbDevice, controlled: boolean): Promise<void> {
  await Promise.allSettled(device.cardIds.map(id => setLightingDeviceControlled(id, controlled)));
}
