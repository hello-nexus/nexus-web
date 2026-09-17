import { describe, expect, it } from 'vitest';
import { minuteOfDay, scheduledBrightness } from './brightnessSchedule';

// Vectors shared with nexus-service's MasterBrightnessTests: both sides
// evaluate the same spline, so the slider's readout and the LEDs never
// disagree on the level.
const DEFAULTS = [0, 4, 8, 12, 16, 20].map((hour, i) => ({ hour, brightness: [20, 15, 60, 100, 90, 50][i] }));

describe('scheduledBrightness', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it.each([
    [1, 0, 17.1094], [2, 0, 15.625], [3, 0, 15.0781], [6, 0, 32.1875], [10, 0, 85.3125],
    [14, 0, 98.125], [18, 0, 71.25], [22, 0, 32.5], [23, 0, 25.1563], [23, 30, 22.2461],
  ])('curves through the default points like the service does (%i:%i)', (h, m, percent) => {
    expect(scheduledBrightness(DEFAULTS, at(h, m))).toBeCloseTo(percent, 3);
  });

  it('passes through every point', () => {
    for (const p of DEFAULTS) expect(scheduledBrightness(DEFAULTS, at(p.hour))).toBeCloseTo(p.brightness, 6);
  });

  it('wraps midnight continuously', () => {
    const pts = [{ hour: 2, brightness: 20 }, { hour: 22, brightness: 60 }];
    expect(scheduledBrightness(pts, at(23, 59))).toBeCloseTo(scheduledBrightness(pts, -1), 9);
    const midnight = scheduledBrightness(pts, at(0));
    expect(midnight).toBeGreaterThan(20);
    expect(midnight).toBeLessThan(60);
    expect(scheduledBrightness(pts, at(23))).toBeGreaterThan(midnight);
    expect(midnight).toBeGreaterThan(scheduledBrightness(pts, at(1)));
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
