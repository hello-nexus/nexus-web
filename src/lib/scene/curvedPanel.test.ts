import { describe, expect, it } from 'vitest';
import { curvedLayers, curveRadius } from './curvedPanel';

describe('curvedLayers', () => {
  const size: [number, number, number] = [1190, 340, 140];
  const { front, back } = curvedLayers(size, 1800, 8);

  it('spans the chord with the edges toward the viewer, the center of the front arc at the back of the box', () => {
    expect(front).toHaveLength(9);
    expect(front[0][0]).toBeCloseTo(-1190 / 2, 3);
    expect(front[8][0]).toBeCloseTo(1190 / 2, 3);
    expect(front[0][1]).toBeGreaterThan(front[4][1]);
    expect(front[0][1]).toBeCloseTo(size[2] / 2, 3);
  });

  it('fills the box front to back: the back arc is one thickness behind, sharing the center, so the bow is not counted as thickness', () => {
    const sag = front[0][1] - front[4][1];
    const thickness = front[4][1] - back[4][1];
    expect(sag + thickness).toBeCloseTo(size[2], 3);
    expect(back[4][1]).toBeCloseTo(-size[2] / 2, 3);
  });

  it('is symmetric about the middle', () => {
    for (const layer of [front, back]) {
      expect(layer[0][0] + layer[8][0]).toBeCloseTo(0, 6);
      expect(layer[0][1]).toBeCloseTo(layer[8][1], 6);
    }
  });
});

describe('curveRadius', () => {
  it('only a monitor with a positive finite radius is curved', () => {
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 1000 } })).toBe(1000);
    expect(curveRadius({ kind: 'monitor' })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 0 } })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: Number.NaN } })).toBeNull();
    expect(curveRadius({ kind: 'keyboard', curve: { radiusMm: 1000 } })).toBeNull();
  });
});
