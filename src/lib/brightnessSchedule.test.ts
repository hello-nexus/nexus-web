import { describe, expect, it } from 'vitest';
import { minuteOfDay, scheduledBrightness } from './brightnessSchedule';

// Vectors shared with nexus-service's MasterBrightnessTests: both sides
// evaluate the same rule, so the slider's readout and the LEDs never
// disagree on the level.
const DEFAULTS = [0, 4, 8, 12, 16, 20].map((hour, i) => ({ hour, brightness: [20, 15, 60, 100, 90, 50][i] }));

describe('scheduledBrightness', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it.each([
    [1, 0, 18.75], [2, 0, 17.5], [3, 0, 16.25], [6, 0, 37.5], [10, 0, 80],
    [14, 0, 95], [18, 0, 70], [22, 0, 35], [23, 0, 27.5], [23, 30, 23.75],
  ])('follows the default points like the service does (%i:%i)', (h, m, percent) => {
    expect(scheduledBrightness(DEFAULTS, at(h, m))).toBeCloseTo(percent, 4);
  });

  it('interpolates by the minute', () => {
    const pts = [{ hour: 6, brightness: 40 }, { hour: 8, brightness: 70 }];
    expect(scheduledBrightness(pts, at(6, 1))).toBeCloseTo(40.25);
    expect(scheduledBrightness(pts, at(7))).toBeCloseTo(55);
  });

  it('passes through every point', () => {
    for (const p of DEFAULTS) expect(scheduledBrightness(DEFAULTS, at(p.hour))).toBeCloseTo(p.brightness, 6);
  });

  it('wraps midnight as one ramp', () => {
    const pts = [{ hour: 2, brightness: 20 }, { hour: 22, brightness: 60 }];
    expect(scheduledBrightness(pts, at(23, 59))).toBeCloseTo(scheduledBrightness(pts, -1), 9);
    expect(scheduledBrightness(pts, at(23))).toBeCloseTo(50);
    expect(scheduledBrightness(pts, at(0))).toBeCloseTo(40);
    expect(scheduledBrightness(pts, at(1))).toBeCloseTo(30);
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
