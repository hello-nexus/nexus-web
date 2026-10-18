import type { OpenRgbZone, OpenRgbZoneDevice } from '../../../api/openRgbZones';

/** The zones the user can resize: a fixed-size zone has no control. */
export function resizableZones(device: OpenRgbZoneDevice): OpenRgbZone[] {
  return device.zones.filter(z => z.resizable);
}

/** True when a zone that has a control still waits for its first user-chosen size. */
export function deviceNeedsSize(device: OpenRgbZoneDevice | undefined): boolean {
  return device != null && resizableZones(device).some(z => z.needsSize);
}

/** Keeps a count inside the zone's range; a malformed range collapses to its minimum. */
export function clampZoneCount(zone: Pick<OpenRgbZone, 'ledsMin' | 'ledsMax'>, count: number): number {
  const max = Math.max(zone.ledsMin, zone.ledsMax);
  return Math.min(max, Math.max(zone.ledsMin, Math.round(count)));
}

/** The service keys a device by its OpenRGB device id, the same id the Devices row carries. */
export function zoneDeviceFor(zones: readonly OpenRgbZoneDevice[], deviceId: string): OpenRgbZoneDevice | undefined {
  return zones.find(z => z.deviceId === deviceId);
}
