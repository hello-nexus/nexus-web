import { describe, expect, it } from 'vitest';
import { areaCellPolygons } from './areaCells';

describe('areaCellPolygons', () => {
  it('keeps card-local indices and skips empty or degenerate cells', () => {
    const cells = [[0, 0, 0.5, 0, 0.5, 1, 0, 1], [], [0.5, 0, 1, 0, 1, 1, 0.5, 1], [0, 0, 1, 1]];
    expect(areaCellPolygons(cells)).toEqual([
      { index: 0, points: '0,0 0.5,0 0.5,1 0,1' },
      { index: 2, points: '0.5,0 1,0 1,1 0.5,1' },
    ]);
  });
  it('tolerates absent cells', () => {
    expect(areaCellPolygons(undefined)).toEqual([]);
  });
});
