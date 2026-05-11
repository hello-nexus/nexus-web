// Vendor-agnostic WebHID discovery. Works against every vendor registered via
// registerWebHidVendor — today Razer, tomorrow Logitech / Corsair Bragi / QMK.
import './types';
import './razer/index'; // side-effect: registers Razer
import { requestDeviceFilters, tryWrapPeripheral, type WebHidPeripheral } from './peripheral';

export function isWebHidAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator && navigator.hid !== undefined;
}

/** Returns all previously-granted devices we know how to wrap. Silent — the user
 *  must have granted access in a prior session (or this one). */
export async function getGrantedPeripherals(): Promise<WebHidPeripheral[]> {
  if (!isWebHidAvailable()) return [];
  const devices = await navigator.hid!.getDevices();
  const result: WebHidPeripheral[] = [];
  for (const d of devices) {
    const p = tryWrapPeripheral(d);
    if (p) result.push(p);
  }
  return result;
}

/** Opens Chrome's device picker. Must be called from a user gesture. The picker's
 *  filter is the union of registered vendor IDs so only supported devices appear. */
export async function requestPeripheral(): Promise<WebHidPeripheral | null> {
  if (!isWebHidAvailable()) return null;
  const filters = requestDeviceFilters();
  const devices = await navigator.hid!.requestDevice({ filters });
  if (devices.length === 0) return null;
  for (const d of devices) {
    const p = tryWrapPeripheral(d);
    if (p) return p;
  }
  return null;
}
