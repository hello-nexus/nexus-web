import { describe, expect, it } from 'vitest';
import { ANIMATE_SWATCHES, DEFAULT_ANIMATION_KEYS, STATIC_SWATCHES, defaultSwatchCount, fitSwatchGrid } from './swatches';

describe('swatches', () => {
  it('resolves every default color id', () => {
    expect(STATIC_SWATCHES).toHaveLength(16);
    expect(new Set(STATIC_SWATCHES.map(c => c.id)).size).toBe(16);
  });

  it('leads with the default animation order, then the catalog', () => {
    expect(ANIMATE_SWATCHES.slice(0, DEFAULT_ANIMATION_KEYS.length).map(e => e.key)).toEqual(DEFAULT_ANIMATION_KEYS);
    expect(ANIMATE_SWATCHES).toHaveLength(20);
    expect(new Set(ANIMATE_SWATCHES.map(e => e.key)).size).toBe(20);
    expect(ANIMATE_SWATCHES.every(e => !!e.labelKey)).toBe(true);
  });

  it('defaults by widget size', () => {
    expect(defaultSwatchCount('2x2')).toBe(4);
    expect(defaultSwatchCount('4x2')).toBe(6);
    expect(defaultSwatchCount('4x4')).toBeGreaterThan(6);
  });

  it('fits more cells into a larger box and never exceeds the cap', () => {
    const small = fitSwatchGrid(120, 120, 1, 16);
    const large = fitSwatchGrid(400, 400, 1, 16);
    expect(large.count).toBeGreaterThan(small.count);
    expect(fitSwatchGrid(2000, 2000, 1, 16).count).toBe(16);
  });

  it('always shows at least one cell', () => {
    expect(fitSwatchGrid(10, 10, 1, 16).count).toBe(1);
    expect(fitSwatchGrid(0, 0, 1, 16).count).toBe(1);
  });
});
