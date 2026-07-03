// Vendor-agnostic WebHID discovery. Works against every vendor registered via
// registerWebHidVendor.
import './types';
import './razer/index'; // side-effect: registers Razer
import { tryWrapPeripheral, type WebHidPeripheral } from './peripheral';

export function isWebHidAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator && navigator.hid !== undefined;
}

/** Returns all previously-granted devices we know how to wrap. Silent - the user
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
