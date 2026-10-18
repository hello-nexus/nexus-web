import type { OpenRgbZone, OpenRgbZoneDevice } from '../../../api/openRgbZones';

/** The zones the user can resize: a fixed-size zone has no control. */
export function resizableZones(device: OpenRgbZoneDevice): OpenRgbZone[] {
  return device.zones.filter(z => z.resizable);
}

/** True when any zone still waits for its first user-chosen size. */
export function deviceNeedsSize(device: OpenRgbZoneDevice | undefined): boolean {
  return device?.zones.some(z => z.needsSize) === true;
}

/** Keeps a count inside the zone's range; a malformed range collapses to its minimum. */
export function clampZoneCount(zone: Pick<OpenRgbZone, 'ledsMin' | 'ledsMax'>, count: number): number {
  const max = Math.max(zone.ledsMin, zone.ledsMax);
  return Math.min(max, Math.max(zone.ledsMin, Math.round(count)));
}

/**
 * The zone list for one Devices row. The service keys a device by the id of its
 * unsplit card; a split device's row id is its parent, so any owned card id matches too.
 */
export function zoneDeviceFor(
  zones: readonly OpenRgbZoneDevice[],
  deviceId: string,
  cardIds: readonly string[],
): OpenRgbZoneDevice | undefined {
  return zones.find(z => z.deviceId === deviceId) ?? zones.find(z => cardIds.includes(z.deviceId));
}
