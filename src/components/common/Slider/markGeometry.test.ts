import { describe, it, expect } from 'vitest';
import { markAnchor, layoutMarks } from './markGeometry';

describe('markAnchor', () => {
  it('follows the knob travel: half a knob in at the ends', () => {
    expect(markAnchor(0, 500, 24)).toBe(12);
    expect(markAnchor(1, 500, 24)).toBe(488);
    expect(markAnchor(0.5, 500, 24)).toBe(250);
  });
  it('clamps a position outside the scale', () => {
    expect(markAnchor(-1, 500, 24)).toBe(12);
    expect(markAnchor(2, 500, 24)).toBe(488);
  });
});

describe('layoutMarks', () => {
  it('centers a box on its anchor', () => {
    expect(layoutMarks([{ anchor: 250, w: 100 }], 500)).toEqual([200]);
  });
  it('keeps boxes inside the track at both ends', () => {
    expect(layoutMarks([{ anchor: 12, w: 100 }, { anchor: 488, w: 100 }], 500)).toEqual([0, 400]);
  });
  it('moves colliding boxes apart without leaving the track', () => {
    const [a, b] = layoutMarks([{ anchor: 400, w: 120 }, { anchor: 488, w: 120 }], 500);
    expect(b).toBe(380);
    expect(a + 120 + 8).toBeLessThanOrEqual(b);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it('returns lefts in input order', () => {
    const lefts = layoutMarks([{ anchor: 488, w: 100 }, { anchor: 12, w: 100 }], 500);
    expect(lefts).toEqual([400, 0]);
  });
  it('overlaps from the right edge when the boxes cannot fit', () => {
    const lefts = layoutMarks([{ anchor: 50, w: 200 }, { anchor: 100, w: 200 }], 300);
    expect(lefts[1] + 200).toBeLessThanOrEqual(300);
    expect(lefts[0]).toBeGreaterThanOrEqual(0);
  });
});
