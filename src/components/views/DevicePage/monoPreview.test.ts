import { describe, expect, it } from 'vitest';
import { MONO_LUMA_OFFSET, MONO_LUMA_WEIGHTS, MONO_STEP_INTERCEPT, MONO_STEP_SLOPE, isMonoFamily, keepsSidePreview } from './monoPreview';

const lit = (luma: number) => Math.min(1, Math.max(0, MONO_STEP_SLOPE * (luma / 255 + MONO_LUMA_OFFSET) + MONO_STEP_INTERCEPT)) === 1;

describe('mono preview', () => {
  it('lights at the service cutoff and not below it', () => {
    expect(lit(95)).toBe(false);
    expect(lit(95.76)).toBe(false);
    expect(lit(96)).toBe(true);
    expect(lit(0)).toBe(false);
    expect(lit(255)).toBe(true);
  });

  it('uses weights summing to one', () => {
    expect(MONO_LUMA_WEIGHTS.r + MONO_LUMA_WEIGHTS.g + MONO_LUMA_WEIGHTS.b).toBeCloseTo(1, 5);
  });

  it('recognizes only the OLED family', () => {
    expect(isMonoFamily('steelseries-apex-oled')).toBe(true);
    expect(keepsSidePreview('steelseries-apex-oled')).toBe(true);
    expect(isMonoFamily('zmatrices-lcd')).toBe(false);
    expect(keepsSidePreview(undefined)).toBe(false);
  });
});
