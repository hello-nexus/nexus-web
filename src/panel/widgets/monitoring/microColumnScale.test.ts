import { describe, expect, it } from 'vitest';
import { columnFitScale, uniformColumnScale } from './microColumnScale';

describe('columnFitScale', () => {
  it('never enlarges and shrinks to the box width', () => {
    expect(columnFitScale(100, 50)).toBe(1);
    expect(columnFitScale(40, 80)).toBe(0.5);
  });
  it('treats an unmeasured box or content as natural size', () => {
    expect(columnFitScale(0, 80)).toBe(1);
    expect(columnFitScale(40, 0)).toBe(1);
  });
});

describe('uniformColumnScale', () => {
  it('takes the smallest scale any column needs', () => {
    expect(uniformColumnScale([1, 0.6, 0.8])).toBe(0.6);
  });
  it('is 1 with no columns or when all fit', () => {
    expect(uniformColumnScale([])).toBe(1);
    expect(uniformColumnScale([1, 1])).toBe(1);
  });
});
