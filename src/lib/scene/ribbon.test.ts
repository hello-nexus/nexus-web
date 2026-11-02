import { describe, expect, it } from 'vitest';
import { ribbonData, type RibbonVec3 } from './ribbon';

const dist = (a: RibbonVec3, b: RibbonVec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('ribbonData', () => {
  const points: RibbonVec3[] = [[0, 0, 0], [0, 0, 50], [0, 0, 100]];
  const across: RibbonVec3[] = [[1, 0, 0], [1, 0, 0], [1, 0, 0]];

  it('sweeps four corners per sample at the given width and thickness', () => {
    const { positions, edges } = ribbonData(points, across, 40, 10);
    expect(positions).toHaveLength(points.length * 4 * 3);
    expect(edges).toHaveLength(4);
    const ring = edges.map((e) => e[1]);
    expect(dist(ring[0], ring[1])).toBeCloseTo(40);
    expect(dist(ring[1], ring[2])).toBeCloseTo(10);
    expect(ring[0][0]).toBeCloseTo(20);
    expect(ring[0][1]).toBeCloseTo(5);
  });

  it('triangulates four sides per segment plus both caps', () => {
    const { indices } = ribbonData(points, across, 40, 10);
    expect(indices).toHaveLength((2 * 4 * 2 + 2 * 2) * 3);
    expect(Math.max(...indices)).toBe(points.length * 4 - 1);
  });

  it('keeps the width direction perpendicular to the path when it runs along it', () => {
    const { edges } = ribbonData([[0, 0, 0], [0, 50, 0], [0, 100, 0]], [[0, 1, 0], [0, 1, 0], [0, 1, 0]], 40, 10);
    const ring = edges.map((e) => e[1]);
    expect(ring.every((c) => Math.abs(c[1] - 50) < 1e-6)).toBe(true);
    expect(dist(ring[0], ring[1])).toBeCloseTo(40);
  });

  it('keeps its thickness at an end whose neighbor repeats it', () => {
    const { edges } = ribbonData([[0, 0, 0], [0, 0, 0], [0, 0, 50]], [[1, 0, 0], [1, 0, 0], [1, 0, 0]], 40, 10);
    const ring = edges.map((e) => e[0]);
    expect(dist(ring[1], ring[2])).toBeCloseTo(10);
  });

  it('returns nothing for a single point', () => {
    expect(ribbonData([[0, 0, 0]], across, 40, 10).positions).toEqual([]);
  });
});
