import { describe, expect, it } from 'vitest';
import { areaBoxRects } from './areaBoxes';

describe('areaBoxRects', () => {
  it('unpacks boxes and skips disabled entries, keeping card-local indices', () => {
    expect(areaBoxRects([0, 0, 0.5, 0.5, 0, 0, 0, 0, 0.5, 0.5, 1, 1])).toEqual([
      { index: 0, u0: 0, v0: 0, u1: 0.5, v1: 0.5 },
      { index: 2, u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
    ]);
  });
  it('ignores a trailing partial entry', () => {
    expect(areaBoxRects([0, 0, 1, 1, 0.1])).toHaveLength(1);
  });
});
