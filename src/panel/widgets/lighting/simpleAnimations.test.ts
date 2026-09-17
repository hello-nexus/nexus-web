import { describe, expect, it } from 'vitest';
import { PALETTE_FAMILIES } from '../../../types/lightingPalette';
import { SIMPLE_ANIMATION_KEYS, simpleAnimationIndex, simpleAnimationState } from './simpleAnimations';

describe('simple-mode animations', () => {
  // The row is laid out to land flush with the palette above it: one tile per
  // two swatch columns. Adding a family or a tile without the other silently
  // breaks that alignment, and nothing else would catch it.
  it('paletteSpansTwoSwatches', () => {
    expect(PALETTE_FAMILIES.length).toBe(SIMPLE_ANIMATION_KEYS.length * 2);
  });

  it('numbers tiles from one, in row order', () => {
    expect(simpleAnimationIndex(SIMPLE_ANIMATION_KEYS[0])).toBe(1);
    expect(simpleAnimationIndex(SIMPLE_ANIMATION_KEYS[6])).toBe(7);
  });

  // Direction is the speed sign and nothing else: the engine reads a negative
  // speed as time running backwards.
  it('carries direction in the speed sign alone', () => {
    const fwd = simpleAnimationState(false);
    const rev = simpleAnimationState(true);
    expect(fwd.speed).toBe(50);
    expect(rev.speed).toBe(-50);
    expect({ ...fwd, speed: 0 }).toEqual({ ...rev, speed: 0 });
  });
});
