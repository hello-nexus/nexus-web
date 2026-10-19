// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CENTERED_REGION, isCentered, moveRegion, regionExtent, resizeRegion, resolveRegion } from './squareRegion';

const WIDE = 16 / 9;

describe('squareRegion', () => {
  it('the default is the largest centered square', () => {
    const r = resolveRegion(CENTERED_REGION, WIDE);
    expect(r.h).toBe(1);
    expect(r.w).toBeCloseTo(9 / 16);
    expect(r.x).toBeCloseTo((1 - 9 / 16) / 2);
    expect(r.y).toBe(0);
    expect(isCentered(CENTERED_REGION)).toBe(true);
  });

  it('extent follows the shorter side of the display', () => {
    expect(regionExtent(0.5, WIDE).h).toBe(0.5);
    expect(regionExtent(0.5, WIDE).w).toBeCloseTo(0.5 / WIDE);
    expect(regionExtent(0.5, 0.5)).toEqual({ w: 0.5, h: 0.25 });
  });

  it('moving from the default keeps the full-size square and stays on the display', () => {
    const moved = moveRegion(CENTERED_REGION, WIDE, 0.1, 0.5);
    expect(moved.size).toBe(1);
    expect(moved.y).toBe(0);
    expect(moved.x).toBeGreaterThan((1 - 9 / 16) / 2);
    const far = moveRegion(CENTERED_REGION, WIDE, 5, 0);
    expect(far.x).toBeCloseTo(1 - 9 / 16);
  });

  it('resizing keeps the center and the square on the display', () => {
    const start = { x: 0.2, y: 0.2, size: 0.5 };
    const r = resolveRegion(start, WIDE);
    const resized = resizeRegion(start, WIDE, 0.3);
    const next = resolveRegion(resized, WIDE);
    expect(next.x + next.w / 2).toBeCloseTo(r.x + r.w / 2);
    expect(next.y + next.h / 2).toBeCloseTo(r.y + r.h / 2);
    expect(resizeRegion(start, WIDE, 0.001).size).toBe(0.1);
    expect(resizeRegion({ x: 0.9, y: 0.9, size: 0.2 }, WIDE, 1).y).toBe(0);
  });

  it('clamps a stored square that no longer fits', () => {
    const r = resolveRegion({ x: 0.99, y: 0.99, size: 0.5 }, WIDE);
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });
});
