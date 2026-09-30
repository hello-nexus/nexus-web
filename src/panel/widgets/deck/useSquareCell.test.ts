import { describe, it, expect } from 'vitest';
import { squareCellSize } from './useSquareCell';

describe('squareCellSize', () => {
  it('is bounded by the height in a wide box, leaving the extra width to the gaps', () => {
    expect(squareCellSize(400, 300, 4, 4, 11, 11)).toBe(66);
  });

  it('is bounded by the width in a tall box', () => {
    expect(squareCellSize(300, 400, 4, 4, 11, 11)).toBe(66);
  });

  it('fits a single row strip by its height', () => {
    expect(squareCellSize(400, 80, 4, 1, 11, 11)).toBe(80);
  });

  it('returns null for an unmeasured or too-small box', () => {
    expect(squareCellSize(0, 0, 4, 4, 11, 11)).toBeNull();
    expect(squareCellSize(20, 20, 4, 4, 11, 11)).toBeNull();
    expect(squareCellSize(100, 100, 0, 4, 11, 11)).toBeNull();
  });
});
