import { describe, expect, it } from 'vitest';
import { curvedProfile, curveRadius } from './curvedPanel';

describe('curvedProfile', () => {
  it('spans the panel width with the edges toward the viewer and the footprint centered', () => {
    const p = curvedProfile(620, 1500, 8);
    expect(p).toHaveLength(9);
    expect(p[0][0]).toBeCloseTo(-p[8][0]);
    expect(Math.abs(p[8][0] - p[0][0])).toBeGreaterThan(600);
    expect(p[0][1]).toBeGreaterThan(p[4][1]);
    expect(p[0][1] + p[4][1]).toBeCloseTo(0, 6);
    expect(p[4][0]).toBeCloseTo(0);
  });

  it('only a monitor with a positive finite radius is curved', () => {
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 1000 } })).toBe(1000);
    expect(curveRadius({ kind: 'monitor' })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: 0 } })).toBeNull();
    expect(curveRadius({ kind: 'monitor', curve: { radiusMm: Number.NaN } })).toBeNull();
    expect(curveRadius({ kind: 'keyboard', curve: { radiusMm: 1000 } })).toBeNull();
  });
});
