import { describe, it, expect } from 'vitest';
import { appendCappedBurst, randomBurstStyle, type BurstParticle } from './particleBurst';

describe('randomBurstStyle', () => {
  it('at randomFn=0, flies straight out along +x for the floor distance and duration', () => {
    const style = randomBurstStyle(20, 'red', () => 0) as Record<string, string>;
    expect(style['--particle-dx']).toBe('26px');
    expect(style['--particle-dy']).toBe('0px');
    expect(style['--particle-tone']).toBe('red');
    expect(style.animationDuration).toBe('320ms');
  });

  it('carries the given tone through untouched', () => {
    const style = randomBurstStyle(10, 'var(--accent-glow)', () => 0.5) as Record<string, string>;
    expect(style['--particle-tone']).toBe('var(--accent-glow)');
  });

  it('scales distance with cellSize', () => {
    const small = randomBurstStyle(10, 'red', () => 0) as Record<string, string>;
    const large = randomBurstStyle(20, 'red', () => 0) as Record<string, string>;
    expect(parseFloat(small['--particle-dx'])).toBe(13);
    expect(parseFloat(large['--particle-dx'])).toBe(26);
  });
});

describe('appendCappedBurst', () => {
  function particle(id: number): BurstParticle {
    return { id, style: {} };
  }

  it('appends the new burst after the existing particles', () => {
    const prev = [particle(1), particle(2)];
    const burst = [particle(3)];
    expect(appendCappedBurst(prev, burst, 10).map(p => p.id)).toEqual([1, 2, 3]);
  });

  it('keeps only the most recent `cap` particles once the total exceeds it', () => {
    const prev = [particle(1), particle(2), particle(3)];
    const burst = [particle(4), particle(5)];
    expect(appendCappedBurst(prev, burst, 3).map(p => p.id)).toEqual([3, 4, 5]);
  });

  it('never grows past the cap even for a burst larger than the cap', () => {
    const burst = [particle(1), particle(2), particle(3), particle(4)];
    expect(appendCappedBurst([], burst, 2).map(p => p.id)).toEqual([3, 4]);
  });
});
