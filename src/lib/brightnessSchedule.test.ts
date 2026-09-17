import { describe, expect, it } from 'vitest';
import { minuteOfDay, scheduledBrightness } from './brightnessSchedule';

// Mirror of the service's MasterBrightness.Scheduled: the vectors here match
// nexus-service's MasterBrightnessTests so the slider's readout and the LEDs
// can never disagree on the level.
describe('scheduledBrightness', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it('interpolates between points by the minute', () => {
    const pts = [{ hour: 6, brightness: 40 }, { hour: 8, brightness: 70 }];
    expect(scheduledBrightness(pts, at(6))).toBe(40);
    expect(scheduledBrightness(pts, at(7))).toBeCloseTo(55);
    expect(scheduledBrightness(pts, at(6, 1))).toBeCloseTo(40.25);
  });

  it('wraps midnight in both directions', () => {
    const pts = [{ hour: 2, brightness: 20 }, { hour: 22, brightness: 60 }];
    expect(scheduledBrightness(pts, at(23))).toBeCloseTo(50);
    expect(scheduledBrightness(pts, at(0))).toBeCloseTo(40);
    expect(scheduledBrightness(pts, at(1))).toBeCloseTo(30);
  });

  it('is independent of point order', () => {
    const sorted = [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }, { hour: 18, brightness: 50 }];
    const shuffled = [sorted[2], sorted[0], sorted[1]];
    for (let h = 0; h < 24; h++) {
      expect(scheduledBrightness(shuffled, at(h))).toBe(scheduledBrightness(sorted, at(h)));
    }
  });

  it('treats an empty schedule as no cap and a single point as flat', () => {
    expect(scheduledBrightness([], at(12))).toBe(100);
    expect(scheduledBrightness([{ hour: 9, brightness: 30 }], at(3))).toBe(30);
    expect(scheduledBrightness([{ hour: 9, brightness: 30 }], at(21))).toBe(30);
  });

  it('drops seconds from the clock', () => {
    expect(minuteOfDay(new Date(2026, 0, 1, 14, 37, 59))).toBe(14 * 60 + 37);
  });
});
