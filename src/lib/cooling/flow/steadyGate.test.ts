// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SteadyGate } from './steadyGate';

describe('SteadyGate', () => {
  it('settles on a check of the current edit with a small change', () => {
    const g = new SteadyGate();
    g.begin();
    expect(g.settles(0.001, 0.5, 0.01)).toBe(true);
    expect(g.settles(0.1, 0.5, 0.01)).toBe(false);
    expect(g.settles(0, 0, 0.01)).toBe(false);
  });

  it('ignores a check that began before a warm edit and resolved after it', () => {
    const g = new SteadyGate();
    g.begin();
    g.invalidate();
    expect(g.settles(0.0001, 0.5, 0.01)).toBe(false);
    g.begin();
    expect(g.settles(0.0001, 0.5, 0.01)).toBe(true);
  });
});
