import { type LightingDevice } from '../../../../api/lighting';

/**
 * Controller-level advisory surfaced as an (i) on a device card or its
 * controller group header. Returns the i18n key for the notice, or null when
 * the device has none. Add a case when a device needs a hover notice.
 */
export function lightingDeviceNoticeKey(device: LightingDevice): string | null {
  // The Lian Li Uni Hub commits streamed (software) lighting once per second.
  if (device.id.startsWith('lianli:')) return 'lighting.devices.lianliStreamRate';
  // The Kraken shares one HID pipe between its LEDs, its telemetry and its LCD.
  if (device.id.startsWith('nzxt-kraken:')) return 'lighting.devices.krakenStreamRate';
  return null;
}
