import { describe, expect, it } from 'vitest';
import { effectiveView3d } from './viewPreference';

describe('effectiveView3d', () => {
  it('shows the stored view when 3D exists and falls back to 2D when it does not', () => {
    expect(effectiveView3d(true, true)).toBe(true);
    expect(effectiveView3d(false, true)).toBe(false);
    expect(effectiveView3d(true, false)).toBe(false);
    expect(effectiveView3d(false, false)).toBe(false);
  });
});
