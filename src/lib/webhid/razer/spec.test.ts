import { describe, it, expect } from 'vitest';
import { RAZER_SPEC, getProfile } from './spec';

describe('Razer spec', () => {
  it('loads the Razer vendor id', () => {
    expect(RAZER_SPEC.vendorId).toBe(0x1532);
  });

  it('exposes VARSTORE = 0x01', () => {
    expect(RAZER_SPEC.varstore).toBe(0x01);
  });

  it('has the core command definitions', () => {
    expect(RAZER_SPEC.commands.setDpi).toEqual({ class: 0x04, id: 0x05, dataSize: 7, reads: false });
    expect(RAZER_SPEC.commands.getDpi).toEqual({ class: 0x04, id: 0x85, dataSize: 7, reads: true });
    expect(RAZER_SPEC.commands.getBattery).toEqual({ class: 0x07, id: 0x80, dataSize: 2, reads: true });
  });

  it('populates standard + hyperpolling polling maps', () => {
    expect(RAZER_SPEC.pollingMaps.standard[1000]).toBe(0x01);
    expect(RAZER_SPEC.pollingMaps.standard[125]).toBe(0x08);
    expect(RAZER_SPEC.pollingMaps.hyperpolling[8000]).toBe(0x01);
    expect(RAZER_SPEC.pollingMaps.hyperpolling[125]).toBe(0x40);
  });

  it('includes the DeathAdder V2 Pro wireless profile with the OpenRazer transaction id', () => {
    const p = getProfile(0x007D);
    expect(p).toBeDefined();
    expect(p!.name).toBe('DeathAdder V2 Pro');
    expect(p!.transactionId).toBe(0x3F);
    expect(p!.maxDpi).toBe(20000);
    expect(p!.polling).toBe('standard');
    expect(p!.hasBattery).toBe(true);
  });

  it('includes the DeathAdder V3 Pro with HyperPolling', () => {
    const p = getProfile(0x00B7);
    expect(p).toBeDefined();
    expect(p!.transactionId).toBe(0x1F);
    expect(p!.polling).toBe('hyperpolling');
    expect(p!.hasBattery).toBe(true);
  });

  it('returns undefined for unknown PID', () => {
    expect(getProfile(0xFFFF)).toBeUndefined();
  });

  it('has all profiles with valid transactionId', () => {
    for (const p of RAZER_SPEC.profiles.values()) {
      expect(p.transactionId).toBeGreaterThanOrEqual(0);
      expect(p.transactionId).toBeLessThanOrEqual(0xFF);
    }
  });
});
