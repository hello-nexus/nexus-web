import { describe, it, expect } from 'vitest';
import {
  registerWebHidVendor,
  tryWrapPeripheral,
  registeredVendorIds,
  requestDeviceFilters,
} from './peripheral';
// Importing ./razer/index registers Razer via its module side-effect.
import './razer/index';

describe('WebHID vendor registry', () => {
  it('registers Razer from its index module', () => {
    expect(registeredVendorIds()).toContain(0x1532);
  });

  it('exposes requestDevice filters for all registered vendors', () => {
    const filters = requestDeviceFilters();
    expect(filters.some(f => f.vendorId === 0x1532)).toBe(true);
  });

  it('tryWrapPeripheral returns null for unknown vendor', () => {
    const fakeDevice = {
      vendorId: 0x9999,
      productId: 0x0001,
      productName: 'mystery',
      opened: false,
      collections: [],
      open: async () => {},
      close: async () => {},
      forget: async () => {},
      sendReport: async () => {},
      sendFeatureReport: async () => {},
      receiveFeatureReport: async () => new DataView(new ArrayBuffer(0)),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HIDDevice;
    expect(tryWrapPeripheral(fakeDevice)).toBeNull();
  });

  it('tryWrapPeripheral routes to Razer for a recognized Razer device', () => {
    const razerDevice = {
      vendorId: 0x1532,
      productId: 0x007D,  // DeathAdder V2 Pro
      productName: 'DeathAdder',
      opened: false,
      collections: [],
      open: async () => {},
      close: async () => {},
      forget: async () => {},
      sendReport: async () => {},
      sendFeatureReport: async () => {},
      receiveFeatureReport: async () => new DataView(new ArrayBuffer(0)),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HIDDevice;
    const wrapped = tryWrapPeripheral(razerDevice);
    expect(wrapped).not.toBeNull();
    expect(wrapped!.vendor).toBe('Razer');
  });

  it('duplicate vendor registration is idempotent', () => {
    const before = registeredVendorIds().length;
    registerWebHidVendor({
      vendorId: 0x1532,
      displayName: 'Razer',
      wrap: () => null,
    });
    expect(registeredVendorIds().length).toBe(before);
  });
});
