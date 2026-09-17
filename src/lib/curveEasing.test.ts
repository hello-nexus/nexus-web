import { describe, expect, it } from 'vitest';
import { interpolateCurve } from './curveEasing';

const DAY = { min: 0, max: 24 };
const schedule = [0, 4, 8, 12, 16, 20].map((h, i) => ({ temp: h, speed: [20, 15, 60, 100, 90, 50][i] }));

describe('interpolateCurve', () => {
  it('linear without wrap is the cooling rule: segments between points, ends held', () => {
    const cool = [{ temp: 30, speed: 20 }, { temp: 60, speed: 50 }, { temp: 90, speed: 80 }];
    expect(interpolateCurve(cool, 45)).toBe(35);
    expect(interpolateCurve(cool, 10)).toBe(20);
    expect(interpolateCurve(cool, 95)).toBe(80);
    expect(interpolateCurve([], 50)).toBe(0);
    expect(interpolateCurve([{ temp: 40, speed: 33 }], 50)).toBe(33);
  });

  it('linear with wrap joins the outermost points across the seam', () => {
    const pts = [{ temp: 2, speed: 20 }, { temp: 22, speed: 60 }];
    expect(interpolateCurve(pts, 23, 'linear', DAY)).toBeCloseTo(50);
    expect(interpolateCurve(pts, 0, 'linear', DAY)).toBeCloseTo(40);
    expect(interpolateCurve(pts, 24, 'linear', DAY)).toBeCloseTo(40);
    expect(interpolateCurve(pts, 1, 'linear', DAY)).toBeCloseTo(30);
    expect(interpolateCurve(pts, -1, 'linear', DAY)).toBeCloseTo(interpolateCurve(pts, 23, 'linear', DAY));
  });

  it('smooth passes through every point and never overshoots', () => {
    for (const p of schedule) expect(interpolateCurve(schedule, p.temp, 'smooth', DAY)).toBeCloseTo(p.speed, 6);
    let prev = -1;
    for (let x = 4; x <= 12; x += 0.05) {
      const v = interpolateCurve(schedule, x, 'smooth', DAY);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v).toBeLessThanOrEqual(100 + 1e-9);
      prev = v;
    }
    // The wrap segment is one curve: both seam sides agree.
    expect(interpolateCurve(schedule, 24, 'smooth', DAY)).toBeCloseTo(20, 6);
    expect(interpolateCurve(schedule, -0.5, 'smooth', DAY)).toBeCloseTo(interpolateCurve(schedule, 23.5, 'smooth', DAY), 9);
  });

  it('is independent of point order', () => {
    const shuffled = [schedule[3], schedule[0], schedule[5], schedule[1], schedule[4], schedule[2]];
    for (let x = 0; x < 24; x += 0.5) {
      expect(interpolateCurve(shuffled, x, 'smooth', DAY)).toBe(interpolateCurve(schedule, x, 'smooth', DAY));
    }
  });
});
