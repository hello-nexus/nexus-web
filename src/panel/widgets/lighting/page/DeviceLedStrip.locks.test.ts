// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lockedCells } from './DeviceLedStrip';
import type { LightingDevice } from '../../../../api/lighting';

const card = (extra: Partial<LightingDevice>): LightingDevice => ({
  id: 'openrgb:strip', name: 'Strip', ledsOn: true, ledCount: 96, enabledLedCount: 96,
  canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 10, canvasRotation: 0, zoneResizable: false,
  ...extra,
}) as LightingDevice;

const columns = (filled: Record<number, string>) => Array.from({ length: 24 }, (_, i) => filled[i] ?? '');

describe('lockedCells', () => {
  it('paints the columns the service filled, left to right', () => {
    expect(lockedCells(card({ ledColorStrip: columns({ 0: '#f00', 23: '#00f' }) }))).toEqual([[0, '#f00'], [23, '#00f']]);
  });

  it('samples the columns when the strip has fewer cells', () => {
    const cells = lockedCells(card({ ledCount: 12, enabledLedCount: 12, ledColorStrip: columns({ 22: '#0f0', 23: '#0f0' }) }));
    expect(cells).toEqual([[11, '#0f0']]);
  });

  it('paints nothing without columns', () => {
    expect(lockedCells(card({ ledColors: [{ index: 0, color: '#fff' }] }))).toEqual([]);
  });
});
