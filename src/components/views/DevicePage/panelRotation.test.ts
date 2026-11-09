import { describe, expect, it } from 'vitest';
import { resolveRecordRotation, resolveSupportedRotations, rotationOptions } from './panelRotation';

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
  it('labels every rotation in degrees, whatever the glass', () => {
    expect(rotationOptions([0, 90, 180, 270])).toEqual([
      { value: '0', label: '0°' },
      { value: '90', label: '90°' },
      { value: '180', label: '180°' },
      { value: '270', label: '270°' },
    ]);
    expect(rotationOptions([0, 180]).map(o => o.label)).toEqual(['0°', '180°']);
  });
});
