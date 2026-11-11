import { describe, expect, it } from 'vitest';
import { brightnessCauses, effectiveBrightness } from './effectiveBrightness';

describe('effectiveBrightness', () => {
  it('is the master when the device is at full', () => {
    expect(effectiveBrightness({ master: 80, schedule: null, device: 100, scales: false })).toBe(80);
  });

  it('caps the master with the schedule', () => {
    expect(effectiveBrightness({ master: 100, schedule: 45, device: 100, scales: false })).toBe(45);
    expect(effectiveBrightness({ master: 30, schedule: 45, device: 100, scales: false })).toBe(30);
  });

  it('caps the device when master does not scale', () => {
    expect(effectiveBrightness({ master: 60, schedule: null, device: 40, scales: false })).toBe(40);
    expect(effectiveBrightness({ master: 60, schedule: null, device: 90, scales: false })).toBe(60);
  });

  it('multiplies the device when master scales', () => {
    expect(effectiveBrightness({ master: 50, schedule: 50, device: 50, scales: true })).toBe(25);
  });
});

describe('brightnessCauses', () => {
  it('lists only the controls below full, in tooltip order', () => {
    expect(brightnessCauses({ master: 90, schedule: 45, device: 80, scales: false })).toEqual([
      { kind: 'device', level: 80 }, { kind: 'schedule', level: 45 }, { kind: 'master', level: 90 },
    ]);
    expect(brightnessCauses({ master: 100, schedule: null, device: 100, scales: false })).toEqual([]);
    expect(brightnessCauses({ master: 100, schedule: 45, device: 100, scales: false })).toEqual([{ kind: 'schedule', level: 45 }]);
  });
});
