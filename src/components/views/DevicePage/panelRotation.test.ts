import { describe, expect, it } from 'vitest';
import { resolveRecordRotation, resolveSupportedRotations, rotationOptions } from './panelRotation';

const t = (k: string) => k;

describe('resolveRecordRotation', () => {
  it('reads rotation when present', () => {
    expect(resolveRecordRotation({ rotation: 270, flip180: true })).toBe(270);
    expect(resolveRecordRotation({ rotation: 0, flip180: true })).toBe(0);
  });
  it('falls back to flip180 only when rotation is undefined', () => {
    expect(resolveRecordRotation({ flip180: true })).toBe(180);
    expect(resolveRecordRotation({ flip180: false })).toBe(0);
    expect(resolveRecordRotation(undefined)).toBe(0);
  });
  it('maps legacy portrait to 90, or 270 with flip180', () => {
    expect(resolveRecordRotation({ portrait: true })).toBe(90);
    expect(resolveRecordRotation({ portrait: true, flip180: true })).toBe(270);
    expect(resolveRecordRotation({ rotation: 0, portrait: true })).toBe(0);
  });
});

describe('resolveSupportedRotations', () => {
  it('uses the service list, dropping unknown values', () => {
    expect(resolveSupportedRotations([0, 90, 45], false)).toEqual([0, 90]);
  });
  it('falls back for an older service', () => {
    expect(resolveSupportedRotations(undefined, false)).toEqual([0, 180]);
    expect(resolveSupportedRotations([], true)).toEqual([0, 90, 180, 270]);
  });
});

describe('rotationOptions', () => {
  it('uses Y70 wording on rectangular glass', () => {
    expect(rotationOptions([0, 90, 180, 270], 'lcd-wide', t)).toEqual([
      { value: '0', label: 'devices.y70.orientation.Landscape' },
      { value: '90', label: 'devices.y70.orientation.Portrait' },
      { value: '180', label: 'devices.y70.orientation.LandscapeFlipped' },
      { value: '270', label: 'devices.y70.orientation.PortraitFlipped' },
    ]);
    expect(rotationOptions([0], 'monitor', t)[0].label).toBe('devices.y70.orientation.Landscape');
  });
  it('uses degree labels on square and round glass', () => {
    expect(rotationOptions([0, 180], 'lcd-round', t).map(o => o.label)).toEqual(['0°', '180°']);
    expect(rotationOptions([90], 'lcd-square', t)[0].label).toBe('90°');
  });
});
