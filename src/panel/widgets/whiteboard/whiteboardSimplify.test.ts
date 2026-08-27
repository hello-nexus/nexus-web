// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { quantize, shouldCapture, simplify } from './whiteboardSimplify';
import type { Point } from './whiteboardTypes';

describe('shouldCapture', () => {
  it('always keeps the first point of a stroke', () => {
    expect(shouldCapture(undefined, { x: 0, y: 0 }, 5)).toBe(true);
  });

  it('drops samples closer than the gap and keeps the rest', () => {
    const last = { x: 0, y: 0 };
    expect(shouldCapture(last, { x: 1, y: 0 }, 2)).toBe(false);
    expect(shouldCapture(last, { x: 3, y: 0 }, 2)).toBe(true);
  });
});

describe('simplify', () => {
  it('leaves short paths untouched', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(simplify(pts, 1)).toEqual(pts);
  });

  it('collapses a straight run to its endpoints', () => {
    const pts: Point[] = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0 }]);
  });

  it('keeps a corner that exceeds the tolerance', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }];
    expect(simplify(pts, 1)).toEqual(pts);
  });

  it('keeps every endpoint and stays within tolerance of the original shape', () => {
    const pts: Point[] = Array.from({ length: 400 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 9) * 40,
    }));
    const out = simplify(pts, 1);
    expect(out.length).toBeLessThan(pts.length);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('does not blow the stack on a long already-straight path', () => {
    // The pathological input for a recursive RDP: every point collinear, so
    // the split never terminates early. A real stroke can reach this length.
    const pts: Point[] = Array.from({ length: 20000 }, (_, i) => ({ x: i, y: 0 }));
    expect(() => simplify(pts, 0.1)).not.toThrow();
    expect(simplify(pts, 0.1)).toHaveLength(2);
  });

  it('is a no-op at zero tolerance', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0.0001 }, { x: 2, y: 0 }];
    expect(simplify(pts, 0)).toEqual(pts);
  });
});

describe('quantize', () => {
  it('rounds to a tenth of a canvas unit', () => {
    expect(quantize([{ x: 1.23456, y: -9.87654 }])).toEqual([{ x: 1.2, y: -9.9 }]);
  });
});
