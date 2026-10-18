import { describe, expect, it } from 'vitest';
import vectors from './sunsetShiftVectors.json';
import { dragSunLevels, localDateKey, minuteOfDay, scheduledBrightness, sunCurve, sunRole, sunRoleLevel } from './brightnessSchedule';

// Vectors shared with nexus-service's MasterBrightnessTests: both sides
// evaluate the same rule, so the slider's readout and the LEDs never
// disagree on the level.
const DEFAULTS = [5, 7, 10, 17, 20, 22].map((hour, i) => ({ hour, brightness: [10, 30, 100, 100, 30, 10][i] }));

describe('scheduledBrightness', () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it.each([
    [3, 0, 10], [6, 0, 20], [8, 0, 53.3333], [9, 0, 76.6667], [12, 0, 100], [18, 0, 76.6667],
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

  it('formats the local date like the service', () => {
    expect(localDateKey(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05');
  });
});

describe('sunCurve', () => {
  // The service's generated shape around sunrise and sunset.
  const sunPoints = [
    { min: 360, brightness: 10 }, { min: 420, brightness: 30 }, { min: 540, brightness: 100 },
    { min: 1020, brightness: 100 }, { min: 1140, brightness: 30 }, { min: 1200, brightness: 10 },
  ];
  const sun = (over: Record<string, unknown> = {}) => ({
    status: 'ok' as const, date: '2026-03-05', sunriseMin: 420, sunsetMin: 1140, sunPoints, resolvedLocation: null, autoLocation: null, ...over,
  });
  const at = (minute: number) => scheduledBrightness(sunCurve(true, sun())!, minute);

  it('turns minutes into fractional hours', () => {
    expect(sunCurve(true, sun())![1]).toEqual({ hour: 7, brightness: 30 });
  });

  it('plays the user curve when off or the sun is unusable', () => {
    expect(sunCurve(false, sun())).toBeNull();
    expect(sunCurve(true, null)).toBeNull();
    expect(sunCurve(true, sun({ status: 'polar-day' }))).toBeNull();
    expect(sunCurve(true, sun({ status: 'no-location', sunPoints: [] }))).toBeNull();
    expect(sunCurve(true, sun({ sunPoints: [] }))).toBeNull();
  });

  it.each([
    [360, 10], [390, 20], [420, 30], [480, 65], [540, 100], [780, 100], [1080, 65], [1140, 30], [1200, 10],
    [1320, 10], [0, 10], [180, 10],
  ])('interpolates the generated points (minute %i)', (minute, percent) => {
    expect(at(minute)).toBeCloseTo(percent, 4);
  });
});

// Shared with nexus-service: the generated points and the level the service
// reads from them at sample minutes.
describe('sun levels', () => {
  const sunTimes = { sunriseMin: 420, sunsetMin: 1140 };
  it('tells night, day and the locked sunrise and sunset points apart', () => {
    expect([360, 420, 540, 1020, 1140, 1200].map(m => sunRole(m, sunTimes)))
      .toEqual(['night', 'mid', 'day', 'day', 'mid', 'night']);
  });

  it('puts the sunrise and sunset points midway between night and day', () => {
    expect(sunRoleLevel('mid', { night: 10, day: 100 })).toBe(55);
    expect(sunRoleLevel('mid', { night: 20, day: 61 })).toBe(41);
  });

  it('keeps a dragged level within 0..100 and night at or below day', () => {
    expect(dragSunLevels('night', 90, { night: 10, day: 60 })).toEqual({ night: 60, day: 60 });
    expect(dragSunLevels('day', 5, { night: 10, day: 60 })).toEqual({ night: 10, day: 10 });
    expect(dragSunLevels('day', 140, { night: 10, day: 60 })).toEqual({ night: 10, day: 100 });
    expect(dragSunLevels('night', -8, { night: 10, day: 60 })).toEqual({ night: 0, day: 60 });
  });

  describe('when sunset comes before sunrise on the clock', () => {
    // Sunrise 21:30, sunset 11:50 next day; the service's points mod 1440, sorted.
    const sun = {
      status: 'ok' as const, date: '2026-03-05', sunriseMin: 1290, sunsetMin: 710, resolvedLocation: null, autoLocation: null,
      sunPoints: [590, 710, 770, 1230, 1290, 1410].map(min => ({ min, brightness: 1 })),
    };
    it('labels the day points as day', () => {
      expect(sun.sunPoints.map(p => sunRole(p.min, sun))).toEqual(['day', 'mid', 'night', 'night', 'mid', 'day']);
    });
    it('re-levels the curve by those roles', () => {
      expect(sunCurve(true, sun, { night: 20, day: 80 })!.map(p => p.brightness)).toEqual([80, 50, 20, 20, 50, 80]);
    });
  });

  it('re-levels the generated points locally, x unchanged', () => {
    const sun = {
      status: 'ok' as const, date: '2026-03-05', sunriseMin: 420, sunsetMin: 1140, resolvedLocation: null, autoLocation: null,
      sunPoints: [360, 420, 540, 1020, 1140, 1200].map(min => ({ min, brightness: 1 })),
    };
    expect(sunCurve(true, sun, { night: 20, day: 80 })!.map(p => p.brightness)).toEqual([20, 50, 80, 80, 50, 20]);
    expect(sunCurve(true, sun)!.map(p => p.brightness)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('sun curve vectors shared with the service', () => {
  it.each(vectors.map((v, i) => [i, v] as const))('case %i agrees at every sample', (_i, v) => {
    const curve = sunCurve(true, {
      status: 'ok', date: '2026-03-05', sunriseMin: v.sunriseMin, sunsetMin: v.sunsetMin,
      sunPoints: v.expected, resolvedLocation: null, autoLocation: null,
    })!;
    for (const s of v.evalAt) expect(scheduledBrightness(curve, s.minute)).toBeCloseTo(s.expectedBrightness, 3);
  });
});
