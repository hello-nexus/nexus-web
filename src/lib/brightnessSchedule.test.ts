import { describe, expect, it } from 'vitest';
import { minuteOfDay, scheduledBrightness } from './brightnessSchedule';

// Vectors shared with nexus-service's MasterBrightnessTests: both sides
// evaluate the same rule, so the slider's readout and the LEDs never
// disagree on the level.
const DEFAULTS = [5, 8, 17, 20, 22].map((hour, i) => ({ hour, brightness: [10, 100, 100, 30, 10][i] }));

describe('scheduledBrightness', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it.each([
    [3, 0, 10], [6, 0, 40], [7, 0, 70], [12, 0, 100], [18, 0, 76.6667],
    [19, 0, 53.3333], [21, 0, 20], [21, 30, 15], [23, 0, 10], [23, 30, 10],
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
