// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lockedCells } from './DeviceLedStrip';
import type { LightingDevice } from '../../../../api/lighting';

const strip = (extra: Partial<LightingDevice>): LightingDevice => ({
  id: 'openrgb:strip', name: 'Strip', ledsOn: true, ledCount: 96, enabledLedCount: 96,
  canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 10, canvasRotation: 0, zoneResizable: false,
  ledOrderLeftToRight: true,
  ...extra,
}) as LightingDevice;

describe('lockedCells', () => {
  it('places locks by index along a linear strip, one entry per cell', () => {
    const cells = lockedCells(strip({ ledColors: [{ index: 3, color: '#f00' }, { index: 1, color: '#0f0' }, { index: 95, color: '#00f' }] }));
    expect(cells).toEqual([[0, '#0f0'], [23, '#00f']]);
  });

  it('never drops a lock that falls between cell centres', () => {
    expect(lockedCells(strip({ ledColors: [{ index: 6, color: '#fff' }] }))).toEqual([[1, '#fff']]);
  });

  it('paints nothing where index order is not left to right', () => {
    expect(lockedCells(strip({ ledOrderLeftToRight: false, ledColors: [{ index: 0, color: '#fff' }] }))).toEqual([]);
  });
});
