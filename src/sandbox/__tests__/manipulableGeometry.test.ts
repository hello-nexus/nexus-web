import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_SCALE, DEFAULT_MIN_SCALE, applyGesture, basePx, normalizeDeg, readTransform,
} from '../ui/manipulableGeometry';

const rest = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
const w = 400;
const h = 800;
const lim = [DEFAULT_MIN_SCALE, DEFAULT_MAX_SCALE] as const;

describe('applyGesture', () => {
  it('one finger translates by the drag, in layer fractions', () => {
    const next = applyGesture({ transform: rest, a: { x: 100, y: 100 } }, { x: 140, y: 20 }, undefined, w, h, ...lim);
    expect(next.x).toBeCloseTo(0.6);
    expect(next.y).toBeCloseTo(0.4);
    expect(next.scale).toBe(1);
    expect(next.rotation).toBe(0);
  });

  it('a drag cannot leave the layer', () => {
    expect(applyGesture({ transform: rest, a: { x: 0, y: 0 } }, { x: -5000, y: 5000 }, undefined, w, h, ...lim)).toMatchObject({ x: 0, y: 1 });
  });

  it('two fingers scale by distance ratio and rotate by the angle change, from where they started', () => {
    const start = { transform: rest, a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
    expect(applyGesture(start, { x: 100, y: 100 }, { x: 200, y: 100 }, w, h, ...lim)).toEqual(rest);
    const next = applyGesture(start, { x: 150, y: 0 }, { x: 150, y: 200 }, w, h, ...lim);
    expect(next.scale).toBeCloseTo(2);
    expect(next.rotation).toBeCloseTo(90);
    expect(next.x).toBeCloseTo(0.5);
    expect(next.y).toBeCloseTo(0.5);
  });

  it('two-finger scale is clamped to the given range', () => {
    const start = { transform: rest, a: { x: 100, y: 100 }, b: { x: 110, y: 100 } };
    expect(applyGesture(start, { x: 0, y: 100 }, { x: 400, y: 100 }, w, h, 0.5, 2).scale).toBe(2);
    const wide = { transform: rest, a: { x: 0, y: 100 }, b: { x: 400, y: 100 } };
    expect(applyGesture(wide, { x: 199, y: 100 }, { x: 201, y: 100 }, w, h, 0.5, 2).scale).toBe(0.5);
  });

  it('a zero-size layer leaves the transform untouched', () => {
    expect(applyGesture({ transform: rest, a: { x: 0, y: 0 } }, { x: 50, y: 50 }, undefined, 0, 0, ...lim)).toEqual(rest);
  });
});

describe('helpers', () => {
  it('normalize degrees into the signed half turn', () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-190)).toBe(170);
  });

  it('read a transform with clamps and rest-pose fallbacks', () => {
    expect(readTransform({ x: 2, y: -1, scale: 99, rotation: 725 }, ...lim)).toEqual({ x: 1, y: 0, scale: DEFAULT_MAX_SCALE, rotation: 5 });
    expect(readTransform({ x: 'a', scale: Number.NaN }, ...lim)).toEqual(rest);
  });

  it('size from the shorter side with a floor', () => {
    expect(basePx(682, 2560, 0.24)).toBe(Math.round(682 * 0.24));
    expect(basePx(10, 10, 0.24)).toBe(24);
  });
});
