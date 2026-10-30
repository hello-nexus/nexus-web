import { describe, expect, it } from 'vitest';
import { FRAME_RATE_OFF, frameRateCaps, frameRateFromValue, frameRateValue, showsFrameRateSetting } from './frameRateOptions';

describe('frameRateCaps', () => {
  it('offers Off then the lighting frame cap list', () => {
    expect(frameRateCaps(null)).toEqual([null, 30, 20, 15, 10, 5, 1]);
  });

  it('keeps a stored cap outside the presets listed', () => {
    expect(frameRateCaps(24)).toEqual([null, 30, 24, 20, 15, 10, 5, 1]);
    expect(frameRateCaps(60)).toEqual([null, 60, 30, 20, 15, 10, 5, 1]);
  });
});

describe('frameRateValue', () => {
  it('maps a stored cap to its select value and none to Off', () => {
    expect(frameRateValue(30)).toBe('30');
    expect(frameRateValue(null)).toBe(FRAME_RATE_OFF);
    expect(frameRateValue(undefined)).toBe(FRAME_RATE_OFF);
  });
});

describe('frameRateFromValue', () => {
  it('maps the Off value to the clearing 0', () => {
    expect(frameRateFromValue(FRAME_RATE_OFF)).toBe(0);
    expect(frameRateFromValue('15')).toBe(15);
  });
});

describe('showsFrameRateSetting', () => {
  it('shows for streamed displays and display-bound kiosk panels only, never a simulator', () => {
    expect(showsFrameRateSetting(true, false, false)).toBe(true);
    expect(showsFrameRateSetting(false, true, false)).toBe(true);
    expect(showsFrameRateSetting(false, false, false)).toBe(false);
    expect(showsFrameRateSetting(true, true, true)).toBe(false);
  });
});
