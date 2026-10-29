// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { VOLUME_ABSORB_PER_MM, stepOpacity, volumeDensity } from './heatVolumeMath';

describe('heat volume transfer function', () => {
  it('is fully transparent at room temperature, whatever the span', () => {
    for (const span of [0.5, 4, 15]) {
      expect(volumeDensity(0, span)).toBe(0);
      expect(stepOpacity(volumeDensity(0, span), 5)).toBe(0);
    }
  });

  it('rises monotonically with the rise, to the hottest air at the end of the span', () => {
    let last = -1;
    for (let r = 0; r <= 6; r += 0.1) {
      const d = volumeDensity(r, 3);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    expect(volumeDensity(3, 3)).toBe(1);
    expect(volumeDensity(30, 3)).toBe(1);
    expect(volumeDensity(-1, 3)).toBe(0);
  });

  it('makes the hottest column most opaque and a long ray more opaque than a short one', () => {
    expect(stepOpacity(1, 100)).toBeGreaterThan(stepOpacity(0.5, 100));
    expect(stepOpacity(1, 200)).toBeGreaterThan(stepOpacity(1, 100));
    expect(stepOpacity(1, 1 / VOLUME_ABSORB_PER_MM)).toBeCloseTo(1 - Math.exp(-1), 9);
  });
});
