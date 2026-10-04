import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../api/lighting';
import { hostPeripherals } from './hostPeripherals';

const dev = (id: string, patch: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 100, canvasRotation: 0, ...patch,
});

describe('hostPeripherals', () => {
  it('names each keyboard and mouse once, by its hardware name', () => {
    expect(hostPeripherals([
      dev('kb:0', { name: 'HYTE Keeb TKL - Keys', type: 'ledstrip', iconType: 'keyboard', deviceId: 'kb', zoneIndex: 0 }),
      dev('kb:1', { name: 'HYTE Keeb TKL - Logo', type: 'ledstrip', iconType: 'keyboard', deviceId: 'kb', zoneIndex: 1 }),
      dev('m65', { name: 'My mouse', originalName: 'Corsair M65 PRO', type: 'mouse' }),
      dev('gpu', { name: 'NVIDIA GeForce RTX 5080 FE', type: 'gpu' }),
      dev('strip', { name: 'Keyboard underglow', type: 'ledstrip' }),
    ])).toEqual([
      { category: 'keyboard', name: 'HYTE Keeb TKL' },
      { category: 'mouse', name: 'Corsair M65 PRO' },
    ]);
  });
});
