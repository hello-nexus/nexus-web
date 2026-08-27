// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeGameCellSize } from './gameBoardScale';

describe('computeGameCellSize', () => {
  it('fits the narrower axis (width-bound)', () => {
    // 140x420 box, 14x21 grid -> both axes give exactly 10px; width-bound path.
    expect(computeGameCellSize(140, 630, 14, 21)).toBe(10);
  });

  it('fits the narrower axis (height-bound)', () => {
    expect(computeGameCellSize(1000, 210, 14, 21)).toBe(10);
  });

  it('floors a non-integer fit', () => {
    expect(computeGameCellSize(145, 999, 14, 21)).toBe(10);
  });

  it('returns 0 for a zero-size container', () => {
    expect(computeGameCellSize(0, 500, 14, 21)).toBe(0);
    expect(computeGameCellSize(500, 0, 14, 21)).toBe(0);
  });

  it('returns 0 for a degenerate grid', () => {
    expect(computeGameCellSize(500, 500, 0, 21)).toBe(0);
  });
});
