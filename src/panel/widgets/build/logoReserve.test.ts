import { describe, expect, it } from 'vitest';
import { specsClearance } from './logoReserve';

describe('specsClearance', () => {
  it('adds nothing when centering already clears the logo', () => {
    expect(specsClearance(20, 200, 100)).toEqual({ top: 0, narrowFirst: false });
  });
  it('adds just enough that the first row starts at the logo edge', () => {
    const { top, narrowFirst } = specsClearance(40, 150, 100);
    expect(top).toBe(30);
    expect(narrowFirst).toBe(false);
    expect((150 + top - 100) / 2).toBeGreaterThanOrEqual(40);
  });
  it('never exceeds the free height, so the last row never clips', () => {
    expect(specsClearance(30, 150, 120).top).toBe(30);
    expect(specsClearance(80, 100, 120).top).toBe(0);
  });
  it('narrows the first row when the free height is less than the logo reaches', () => {
    expect(specsClearance(60, 150, 120).narrowFirst).toBe(true);
    expect(specsClearance(60, 100, 120).narrowFirst).toBe(true);
  });
});
