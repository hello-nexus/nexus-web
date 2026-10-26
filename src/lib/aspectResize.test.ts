import { describe, expect, it } from 'vitest';
import { capScaleToBounds, dominantScale, lockedFrameSize } from './aspectResize';

describe('dominantScale', () => {
  it('takes the axis that moved further', () => {
    expect(dominantScale(2, 1.2)).toBe(2);
    expect(dominantScale(1.1, 3)).toBe(3);
  });
  it('follows the axis that shrank most', () => {
    expect(dominantScale(0.4, 1)).toBe(0.4);
    expect(dominantScale(1, 0.7)).toBe(0.7);
  });
  it('follows the larger move on a diagonal shrink', () => {
    expect(dominantScale(0.8, 0.5)).toBe(0.5);
  });
  it('follows a single-axis flip', () => {
    expect(dominantScale(-0.5, 1)).toBe(-0.5);
  });
  it('keeps the sign of the winning axis', () => {
    expect(dominantScale(-2, 1)).toBe(-2);
    expect(dominantScale(0.5, -1.5)).toBe(-1.5);
  });
});

describe('capScaleToBounds', () => {
  const anchor = { u: 0.2, v: 0.2 };
  const pts = [{ u: 0.2, v: 0.2 }, { u: 0.4, v: 0.3 }];
  it('passes a scale that fits', () => {
    expect(capScaleToBounds(2, anchor, pts)).toBe(2);
  });
  it('caps by the axis that hits the edge first', () => {
    expect(capScaleToBounds(10, anchor, pts)).toBeCloseTo(4);
  });
  it('caps toward the low edge for a flip', () => {
    expect(capScaleToBounds(-3, anchor, pts)).toBeCloseTo(-1);
  });
  it('ignores points on the anchor axis', () => {
    expect(capScaleToBounds(5, anchor, [{ u: 0.2, v: 0.2 }])).toBe(5);
  });
});

describe('lockedFrameSize', () => {
  const big = 1000;
  it('keeps the start ratio, following the larger axis (growing)', () => {
    const r = lockedFrameSize(200, 100, 300, 120, 60, big, big);
    expect(r.w / r.h).toBeCloseTo(2);
    expect(r.w).toBeCloseTo(300);
  });
  it('follows the height when it moved further', () => {
    const r = lockedFrameSize(200, 100, 210, 300, 60, big, big);
    expect(r.h).toBeCloseTo(300);
    expect(r.w).toBeCloseTo(600);
  });
  it('shrinks on a single axis', () => {
    const r = lockedFrameSize(200, 100, 100, 100, 20, big, big);
    expect(r.w).toBeCloseTo(100);
    expect(r.h).toBeCloseTo(50);
  });
  it('shrinks on a diagonal', () => {
    const r = lockedFrameSize(200, 100, 160, 50, 20, big, big);
    expect(r.h).toBeCloseTo(50);
    expect(r.w).toBeCloseTo(100);
  });
  it('treats a single-axis flip as a collapse held at the minimum', () => {
    const r = lockedFrameSize(200, 100, -100, 100, 60, big, big);
    expect(r.h).toBeCloseTo(60);
    expect(r.w / r.h).toBeCloseTo(2);
  });
  it('clamps to the minimum side without changing the ratio', () => {
    const r = lockedFrameSize(200, 100, 10, 10, 60, big, big);
    expect(r.h).toBeCloseTo(60);
    expect(r.w / r.h).toBeCloseTo(2);
  });
  it('clamps to the maximum box without changing the ratio', () => {
    const r = lockedFrameSize(200, 100, 900, 900, 60, 400, 300);
    expect(r.w).toBeCloseTo(400);
    expect(r.h).toBeCloseTo(200);
  });
  it('lets the minimum win when the box is smaller', () => {
    const r = lockedFrameSize(200, 100, 50, 50, 60, 100, 40);
    expect(r.h).toBeGreaterThanOrEqual(60);
  });
});
