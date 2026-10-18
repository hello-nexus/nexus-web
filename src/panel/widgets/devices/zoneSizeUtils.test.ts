import { describe, expect, it } from 'vitest';
import type { OpenRgbZone, OpenRgbZoneDevice } from '../../../api/openRgbZones';
import { clampZoneCount, deviceNeedsSize, resizableZones, zoneDeviceFor } from './zoneSizeUtils';

const zone = (over: Partial<OpenRgbZone>): OpenRgbZone => ({
  index: 0, name: 'Fan 1', ledCount: 0, ledsMin: 0, ledsMax: 34, resizable: true, needsSize: true, ...over,
});
const device = (zones: OpenRgbZone[], deviceId = 'openrgb-1'): OpenRgbZoneDevice => ({ deviceId, name: 'Commander', zones });

describe('zoneSizeUtils', () => {
  it('lists only zones with a real range', () => {
    const d = device([zone({ index: 0, resizable: false, needsSize: false }), zone({ index: 1 })]);
    expect(resizableZones(d).map(z => z.index)).toEqual([1]);
  });

  it('flags a device while any zone is unsized', () => {
    expect(deviceNeedsSize(device([zone({ needsSize: false }), zone({ index: 1 })]))).toBe(true);
    expect(deviceNeedsSize(device([zone({ needsSize: false })]))).toBe(false);
    expect(deviceNeedsSize(undefined)).toBe(false);
  });

  it('clamps a count into the zone range', () => {
    const z = zone({ ledsMin: 0, ledsMax: 34 });
    expect(clampZoneCount(z, 99)).toBe(34);
    expect(clampZoneCount(z, -3)).toBe(0);
    expect(clampZoneCount(z, 12.4)).toBe(12);
    expect(clampZoneCount({ ledsMin: 5, ledsMax: 5 }, 2)).toBe(5);
  });

  it('matches a row by device id or by one of its card ids', () => {
    const zs = [device([zone({})], 'openrgb-1'), device([zone({})], 'openrgb-2-0')];
    expect(zoneDeviceFor(zs, 'openrgb-1', [])?.deviceId).toBe('openrgb-1');
    expect(zoneDeviceFor(zs, 'openrgb-2', ['openrgb-2-0'])?.deviceId).toBe('openrgb-2-0');
    expect(zoneDeviceFor(zs, 'openrgb-9', ['x'])).toBeUndefined();
  });
});
