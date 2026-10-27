// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HEAT_SPAN_FLOOR_K } from './flowParams';
import { caseFluidCells, easeSpan, percentileRise, spanFor } from './heatSpan';

const scene = { dims: [4, 4, 4] as [number, number, number], caseMin: [1, 1, 1] as [number, number, number], caseMax: [2, 2, 2] as [number, number, number], solid: new Uint8Array(64) };

describe('case fluid cells', () => {
  it('lists the fluid cells inside the case box only', () => {
    const solid = new Uint8Array(64);
    solid[1 + 4 * (1 + 4 * 1)] = 1;
    const cells = caseFluidCells({ ...scene, solid });
    expect(cells.length).toBe(7);
    expect(cells).not.toContain(1 + 4 * (1 + 4 * 1));
    expect(cells).not.toContain(0);
  });
});

describe('percentile span', () => {
  const cells = Uint32Array.from({ length: 1000 }, (_, i) => i);
  const rises = (f: (i: number) => number) => Float32Array.from({ length: 1000 }, (_, i) => f(i));

  it('reads the rank among the case cells, not the single hottest cell', () => {
    // A small hot spike over a field that rises evenly: the rank lands on the even part.
    const field = rises(i => (i < 10 ? 40 : (i / 990) * 3));
    expect(percentileRise(field, cells, 0.98)).toBeCloseTo(3, 0);
  });

  it('puts a uniformly warm case at its own rise', () => {
    expect(percentileRise(rises(() => 2), cells)).toBeCloseTo(2, 1);
  });

  it('is zero for room temperature air and for no cells', () => {
    expect(percentileRise(rises(() => 0), cells)).toBe(0);
    expect(percentileRise(rises(() => 5), new Uint32Array(0))).toBe(0);
  });

  it('never goes below the floor, so a cold idle case keeps a stable scale', () => {
    expect(spanFor(0)).toBe(HEAT_SPAN_FLOOR_K);
    expect(spanFor(0.1)).toBe(HEAT_SPAN_FLOOR_K);
    expect(spanFor(2.5)).toBe(2.5);
  });

  it('a few degrees of rise fills the scale: the hottest air is at the end of the span', () => {
    const field = rises(i => (i / 999) * 3);
    expect(percentileRise(field, cells) / spanFor(percentileRise(field, cells))).toBeCloseTo(1, 5);
  });
});

describe('span easing', () => {
  it('moves toward the target without overshoot and never jumps', () => {
    let k = 10;
    let last = k;
    for (let i = 0; i < 100; i++) { k = easeSpan(k, 2, 16); expect(k).toBeLessThanOrEqual(last); expect(k).toBeGreaterThanOrEqual(2); last = k; }
    expect(k).toBeLessThan(10);
    expect(easeSpan(10, 2, 0)).toBe(10);
    expect(easeSpan(10, 2, 1e9)).toBeCloseTo(2, 6);
  });
});
