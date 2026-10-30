import { describe, expect, it } from 'vitest';
import { FRAME_RATE_OFF, frameRateFromValue, frameRateOptions, frameRateValue } from './frameRateOptions';

describe('frameRateOptions', () => {
  it('offers only presets below the device max', () => {
    expect(frameRateOptions(60, null).map(o => o.fps)).toEqual([null, 30, 20, 15, 10, 5, 1]);
    expect(frameRateOptions(20, null).map(o => o.fps)).toEqual([null, 15, 10, 5, 1]);
    expect(frameRateOptions(5, null).map(o => o.fps)).toEqual([null, 1]);
  });

  it('keeps a stored cap outside the presets that still limits the device', () => {
    expect(frameRateOptions(60, 24).map(o => o.fps)).toEqual([null, 30, 24, 20, 15, 10, 5, 1]);
    expect(frameRateOptions(60, 90).map(o => o.fps)).toEqual([null, 30, 20, 15, 10, 5, 1]);
  });
});

describe('frameRateValue', () => {
  it('reads a cap at or above the device max as no cap', () => {
    expect(frameRateValue(60, 30)).toBe('30');
    expect(frameRateValue(30, 30)).toBe(FRAME_RATE_OFF);
    expect(frameRateValue(20, 30)).toBe(FRAME_RATE_OFF);
    expect(frameRateValue(60, null)).toBe(FRAME_RATE_OFF);
    expect(frameRateValue(60, undefined)).toBe(FRAME_RATE_OFF);
  });
});

describe('frameRateFromValue', () => {
  it('maps the no-cap value to the clearing 0', () => {
    expect(frameRateFromValue(FRAME_RATE_OFF)).toBe(0);
    expect(frameRateFromValue('15')).toBe(15);
  });
});
