import { describe, expect, it } from 'vitest';
import { specsClearance } from './logoReserve';

describe('specsClearance', () => {
  it('adds nothing when centering already clears the logo', () => {
    expect(specsClearance(20, 200, 100)).toEqual({ top: 0, crowded: false });
  });
  it('adds just enough that the first row starts at the logo edge', () => {
    const { top, crowded } = specsClearance(40, 150, 100);
    expect(top).toBe(30);
    expect(crowded).toBe(false);
    expect((150 + top - 100) / 2).toBeGreaterThanOrEqual(40);
  });
  it('never exceeds the free height, so the last row never clips', () => {
    // The uncapped reserve would be past the free height, so it is cut to it.
    expect(specsClearance(45, 150, 120).top).toBe(30);
    expect(specsClearance(80, 100, 120).top).toBe(0);
  });
  it('narrows the first row when the free height is less than the logo reaches', () => {
    expect(specsClearance(60, 150, 120).crowded).toBe(true);
    expect(specsClearance(60, 100, 120).crowded).toBe(true);
  });
});
