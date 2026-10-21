// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { previewFit } from './widgetPreviewFit';

describe('previewFit', () => {
  it('leaves sizes at or under 4x4 unscaled', () => {
    for (const [c, r] of [[1, 1], [2, 2], [4, 1], [4, 2], [2, 4], [4, 4]]) {
      expect(previewFit(c, r).scale).toBe(1);
    }
    expect(previewFit(4, 4)).toEqual({ width: 378, height: 378, scale: 1 });
  });

  it('scales a tall or wide span so its long side fits the 4x4 footprint', () => {
    const tall = previewFit(4, 8);
    expect(tall.height * tall.scale).toBeCloseTo(378);
    expect(tall.width * tall.scale).toBeLessThan(378);
    const big = previewFit(8, 8);
    expect(big.width * big.scale).toBeCloseTo(378);
    expect(big.height * big.scale).toBeCloseTo(378);
    const wide = previewFit(6, 4);
    expect(wide.width * wide.scale).toBeCloseTo(378);
  });
});
