import { type LightingDevice } from '../../../../api/lighting';

/**
 * Controller-level advisory surfaced as an (i) on a device card or its
 * controller group header. Returns the i18n key for the notice, or null when
 * the device has none. Add a case when a device needs a hover notice.
 */
export function lightingDeviceNoticeKey(device: LightingDevice): string | null {
  // Every streamed frame crosses the radio, which cannot carry the full engine rate.
  if (device.id.startsWith('lianli-wireless:')) return 'lighting.devices.partialStreaming';
  // The Kraken shares one HID pipe between its LEDs, its telemetry and its LCD.
  if (device.id.startsWith('nzxt-kraken:')) return 'lighting.devices.partialStreaming';
  return null;
}
