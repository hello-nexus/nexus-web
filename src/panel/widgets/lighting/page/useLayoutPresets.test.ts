import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { devicesToLayouts } from './useLayoutPresets';

describe('devicesToLayouts', () => {
  it('converts devices array to layout map', () => {
    const devices = [
      { id: 'd1', canvasX: 10, canvasY: 20, canvasW: 100, canvasH: 50, canvasRotation: 90 } as unknown as LightingDevice,
      { id: 'd2', canvasX: 0, canvasY: 0, canvasW: 60, canvasH: 30 } as unknown as LightingDevice,
    ];
    const layouts = devicesToLayouts(devices);
    expect(layouts['d1']).toEqual({ x: 10, y: 20, w: 100, h: 50, rotation: 90 });
    expect(layouts['d2']).toEqual({ x: 0, y: 0, w: 60, h: 30, rotation: 0 });
  });
});
