import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';

const h = vi.hoisted(() => ({ fetchService: vi.fn() }));
vi.mock('../../../api/service', () => ({ fetchService: (...args: unknown[]) => h.fetchService(...args) }));

import { BUILD_LAYOUT_RULES, buildMachine, fetchMachineCase, fetchMachineDevices, isValidCaseId, layoutKeyOf, type BuildDevice } from './buildMachine';

const SPECS: SystemSpecs = {
  pcName: 'rig', osBuild: '', processor: 'AMD Ryzen 7 7800X3D', motherboard: 'X670E', memory: '32 GB', storage: '2 TB',
  graphicsCard: 'RTX 4080', primaryGpu: 'RTX 4080', monitor: '2560x1440 @ 165 Hz', soundCard: '', networkCard: '',
};
const device = (key: string, over: Partial<BuildDevice> = {}): BuildDevice => ({ key, modelKey: `m-${key}`, category: 'fan', vendor: 'v', model: 'm', ...over });

afterEach(() => h.fetchService.mockReset());

describe('buildMachine hardwareIds', () => {
  const ids = {
    gpus: [{ vendor: '10de', device: '2704', subVendor: '1043', subDevice: '889e' }],
    ramModules: null,
    drives: [{ vendor: 'Samsung', model: '990 PRO' }],
    board: { manufacturer: 'ASUS', product: 'X670E' },
    monitors: null,
  };

  it('keeps every listed field and null sources', () => {
    expect(buildMachine({ ...SPECS, hardwareIds: ids }, null, []).hardwareIds).toEqual(ids);
  });

  it('drops any field that is not listed, such as a serial', () => {
    const dirty = {
      gpus: [{ vendor: '10de', device: '2704', subVendor: '1043', subDevice: '889e', serial: 'g1' }],
      ramModules: [{ manufacturer: 'Kingston', partNumber: 'P', capacityBytes: 8, configuredSpeedMts: 6000, serial: 'r1' }],
      drives: [{ vendor: 'Samsung', model: '990', serial: 'd1' }],
      board: { manufacturer: 'ASUS', product: 'X', serial: 'b1' },
      monitors: [{ manufacturer: 'DEL', productCode: 'A1', name: 'U', serial: 'm1' }],
    };
    const out = buildMachine({ ...SPECS, hardwareIds: dirty as never }, null, []).hardwareIds;
    expect(JSON.stringify(out)).not.toContain('serial');
    expect(out?.board).toEqual({ manufacturer: 'ASUS', product: 'X' });
    expect(out?.ramModules?.[0]).toEqual({ manufacturer: 'Kingston', partNumber: 'P', capacityBytes: 8, configuredSpeedMts: 6000 });
  });

  it('omits hardwareIds when the service sent none', () => {
    expect('hardwareIds' in buildMachine(SPECS, null, [])).toBe(false);
  });

  it('lists every card in the report order, aligned with the ids', () => {
    const machine = buildMachine({ ...SPECS, graphicsCard: 'ASUS GeForce RTX 4080 + AMD Radeon(TM) Graphics', hardwareIds: { gpus: [{ vendor: '10de', device: '2704', subVendor: '1043', subDevice: '889e' }, { vendor: '1002', device: '164e', subVendor: '1043', subDevice: '8877' }] } }, null, []);
    expect(machine.gpus).toEqual(['ASUS GeForce RTX 4080', 'AMD Radeon(TM) Graphics']);
    expect(machine.gpus?.length).toBe(machine.hardwareIds?.gpus?.length);
  });

  it('omits gpus when the report names no card', () => {
    expect('gpus' in buildMachine({ ...SPECS, graphicsCard: '' }, null, []) && buildMachine({ ...SPECS, graphicsCard: '' }, null, []).gpus).toBeFalsy();
  });

  it('never carries the PC name', () => {
    const machine = buildMachine({ ...SPECS, hardwareIds: ids }, 'hyte-y70', [device('fan-1')]);
    expect(JSON.stringify(machine)).not.toContain(SPECS.pcName);
    expect('pcName' in machine).toBe(false);
  });
});

describe('layoutKeyOf', () => {
  const base = () => buildMachine(SPECS, 'hyte-y70', [device('fan-1', { count: 3 }), device('aio', { category: 'cooler', radiatorMm: 360 })]);

  it('is the same for the same machine, whatever order the devices come in', () => {
    const reversed = buildMachine(SPECS, 'hyte-y70', [device('aio', { category: 'cooler', radiatorMm: 360 }), device('fan-1', { count: 3 })]);
    expect(layoutKeyOf(reversed)).toBe(layoutKeyOf(base()));
  });

  it('changes with the case, the parts, and the coolers and fans', () => {
    const key = layoutKeyOf(base());
    expect(key.split('|')).toContain(`rules=${BUILD_LAYOUT_RULES}`);
    expect(layoutKeyOf(buildMachine(SPECS, 'hyte-y60', base().devices ?? []))).not.toBe(key);
    expect(layoutKeyOf(buildMachine({ ...SPECS, primaryGpu: 'RTX 5090' }, 'hyte-y70', base().devices ?? []))).not.toBe(key);
    expect(layoutKeyOf(buildMachine({ ...SPECS, motherboard: 'B650' }, 'hyte-y70', base().devices ?? []))).not.toBe(key);
    expect(layoutKeyOf(buildMachine(SPECS, 'hyte-y70', [device('fan-1', { count: 3 })]))).not.toBe(key);
    expect(layoutKeyOf(buildMachine(SPECS, 'hyte-y70', [device('fan-1', { count: 4 }), device('aio', { category: 'cooler', radiatorMm: 360 })]))).not.toBe(key);
  });

  it('ignores what the layout does not depend on: peripherals, the monitor, storage', () => {
    const key = layoutKeyOf(base());
    expect(layoutKeyOf(buildMachine({ ...SPECS, monitor: 'other', storage: '4 TB' }, 'hyte-y70', [...(base().devices ?? []), device('mouse-1', { category: 'mouse' })]))).toBe(key);
  });

  describe('card PCI ids', () => {
    const A = { vendor: '10DE', device: '2704', subVendor: '1043', subDevice: '889E' };
    const B = { vendor: '1002', device: '164e', subVendor: '1043', subDevice: '8877' };
    const withIds = (gpus: object[]) => layoutKeyOf(buildMachine({ ...SPECS, hardwareIds: { gpus } }, 'hyte-y70', base().devices ?? []));

    it('is stable across card order and letter case, and lowercases the ids', () => {
      expect(withIds([A, B])).toBe(withIds([B, A]));
      expect(withIds([A])).toBe(withIds([{ vendor: '10de', device: '2704', subVendor: '1043', subDevice: '889e' }]));
      expect(withIds([A])).toContain('|gpuids=10de:2704:1043:889e');
    });

    it('is unchanged when there are no ids', () => {
      const key = layoutKeyOf(base());
      expect(withIds([])).toBe(key);
      expect(layoutKeyOf(buildMachine({ ...SPECS, hardwareIds: { gpus: null } }, 'hyte-y70', base().devices ?? []))).toBe(key);
      expect(key).not.toContain('gpuids');
    });

    it('changes when the ids change, with the name kept', () => {
      expect(withIds([A])).not.toBe(layoutKeyOf(base()));
      expect(withIds([A])).not.toBe(withIds([{ ...A, subDevice: '0000' }]));
      expect(withIds([A])).not.toBe(withIds([A, B]));
    });
  });

  it('reads an unknown case as empty', () => {
    expect(layoutKeyOf(buildMachine(SPECS, null, []))).toContain('case=|');
  });
});

describe('the service reads', () => {
  it('takes a valid case id and nothing else', async () => {
    h.fetchService.mockResolvedValueOnce({ caseId: 'hyte-y70' });
    expect(await fetchMachineCase()).toBe('hyte-y70');
    h.fetchService.mockResolvedValueOnce({ caseId: 'has space' });
    expect(await fetchMachineCase()).toBeNull();
    h.fetchService.mockResolvedValueOnce({ caseId: null });
    expect(await fetchMachineCase()).toBeNull();
    h.fetchService.mockResolvedValueOnce(null);
    expect(await fetchMachineCase()).toBeNull();
  });

  it('keeps only well formed devices, and an empty list for a service that does not answer', async () => {
    h.fetchService.mockResolvedValueOnce({ devices: [device('a'), { key: 'b' }, null, device('c')] });
    expect((await fetchMachineDevices()).map(d => d.key)).toEqual(['a', 'c']);
    h.fetchService.mockResolvedValueOnce(null);
    expect(await fetchMachineDevices()).toEqual([]);
    h.fetchService.mockRejectedValueOnce(new Error('down'));
    expect(await fetchMachineDevices()).toEqual([]);
  });

  it('validates case ids as the cloud api does', () => {
    expect(isValidCaseId(null)).toBe(true);
    expect(isValidCaseId('a.b_c:d-1')).toBe(true);
    expect(isValidCaseId('')).toBe(false);
    expect(isValidCaseId('x'.repeat(65))).toBe(false);
    expect(isValidCaseId(4)).toBe(false);
  });
});
