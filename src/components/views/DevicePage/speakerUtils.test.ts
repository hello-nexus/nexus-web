import { describe, expect, it } from 'vitest';
import { currentPreset, dbLabel, hzLabel, isFlat, signedDb, testOrder, volMax, volOf } from './speakerUtils';

const PRESETS = [
  { name: 'Flat', bands: [0, 0], builtIn: true },
  { name: 'Mine', bands: [1, 2], builtIn: false },
];

describe('hzLabel', () => {
  it('writes the unit, kilohertz as KHz', () => {
    expect([48, 500, 1000, 2000, 16000].map(hzLabel)).toEqual(['48Hz', '500Hz', '1KHz', '2KHz', '16KHz']);
  });
});

describe('dbLabel', () => {
  it('signs the gain and adds the unit', () => {
    expect([6, -20, 0].map(dbLabel)).toEqual(['+6dB', '-20dB', '0dB']);
  });
});

describe('signedDb', () => {
  it('signs positive gains and keeps one decimal', () => {
    expect([3, -4.5, 0, 2.25].map(signedDb)).toEqual(['+3', '-4.5', '0', '+2.3']);
  });
});

describe('volOf and volMax', () => {
  it('shows ten times the linear gain, one when missing', () => {
    expect(volOf(1)).toBe(10);
    expect(volOf(1.1)).toBe(11);
    expect(volOf(undefined)).toBe(10);
    expect(volOf(Number.NaN)).toBe(10);
  });

  it('reads the cap, falling back to twice the default', () => {
    expect(volMax(2)).toBe(20);
    expect(volMax(0)).toBe(20);
    expect(volMax(undefined)).toBe(20);
  });
});

describe('testOrder', () => {
  it('lists the channel numbers clockwise from the front left, skipping missing ones', () => {
    const channels = ['frontLeft', 'frontRight', 'center', 'subwoofer', 'rearLeft', 'rearRight', 'sideLeft', 'sideRight'];
    expect(testOrder(channels)).toEqual([0, 2, 1, 7, 5, 4, 6, 3]);
    expect(testOrder(['center', 'bogus'])).toEqual([0]);
  });
});

describe('presets', () => {
  it('finds the named preset', () => {
    expect(currentPreset(PRESETS, 'Mine')?.builtIn).toBe(false);
    expect(currentPreset(PRESETS, undefined)).toBeUndefined();
    expect(currentPreset(PRESETS, 'Gone')).toBeUndefined();
  });

  it('knows a flat curve', () => {
    expect(isFlat([0, 0, 0])).toBe(true);
    expect(isFlat([0, 1])).toBe(false);
  });
});
