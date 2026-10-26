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
