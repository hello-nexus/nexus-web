// Vendor-agnostic WebHID peripheral contract. Each vendor (Razer today, Logitech
// and Corsair Bragi next) ships a module that registers a tryWrap function here;
// the hook + UI use the unified WebHidPeripheral interface without knowing which
// vendor is behind it.
import './types';

/** Snapshot shape returned by a peripheral. Same fields as the service's PeripheralDto. */
export interface WebHidPeripheralSnapshot {
  id: string;
  name: string;
  vendor: string;
  category: string;
  vendorId: string;
  productId: string;
  isWireless: boolean;
  capabilities: string[];
  dpi?: { minDpi: number; maxDpi: number; step: number; current: number };
  polling?: { supportedHz: number[]; currentHz: number };
  battery?: { percent: number; charging: boolean };
  sleep?: { idleSeconds: number; lowBatteryPercent: number };
}

/** The vendor-agnostic peripheral interface. All capability methods are optional —
 *  the snapshot advertises what's actually supported via the capabilities array. */
export interface WebHidPeripheral {
  readonly device: HIDDevice;
  readonly id: string;
  readonly vendor: string;
  readonly name: string;

  snapshot(): Promise<WebHidPeripheralSnapshot>;
  setDpi?(dpi: number): Promise<boolean>;
  setPolling?(hz: number): Promise<boolean>;
  setIdleSeconds?(seconds: number): Promise<boolean>;
  close?(): Promise<void>;
}

/** Wrapper function — returns a peripheral if the HID device is recognized, null otherwise. */
export type WebHidWrapper = (device: HIDDevice) => WebHidPeripheral | null;

interface VendorRegistration {
  readonly vendorId: number;
  readonly wrap: WebHidWrapper;
  /** Human-readable vendor name for the Chrome picker UI. */
  readonly displayName: string;
}

const VENDORS: VendorRegistration[] = [];

/** Vendor modules call this at import time to opt into discovery + wrapping. */
export function registerWebHidVendor(registration: VendorRegistration): void {
  if (!VENDORS.some(v => v.vendorId === registration.vendorId)) {
    VENDORS.push(registration);
  }
}

/** Attempts each registered vendor wrapper in turn. First match wins. */
export function tryWrapPeripheral(device: HIDDevice): WebHidPeripheral | null {
  for (const v of VENDORS) {
    if (device.vendorId !== v.vendorId) continue;
    const p = v.wrap(device);
    if (p) return p;
  }
  return null;
}

/** VID list for navigator.hid.requestDevice filters. */
export function registeredVendorIds(): number[] {
  return VENDORS.map(v => v.vendorId);
}

/** HIDDeviceFilter list for navigator.hid.requestDevice — one per registered vendor. */
export function requestDeviceFilters(): HIDDeviceFilter[] {
  return VENDORS.map(v => ({ vendorId: v.vendorId }));
}
