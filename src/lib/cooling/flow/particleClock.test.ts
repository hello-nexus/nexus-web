import { describe, expect, it } from 'vitest';
import { PARTICLE_CLOCK_MAX_STEPS, PARTICLE_STEPS_PER_SECOND, ParticleClock } from './particleClock';

const stepsOver = (fps: number, seconds: number) => {
  const clock = new ParticleClock();
  let total = 0;
  for (let f = 0; f < fps * seconds; f++) total += clock.advance(1000 / fps);
  return total;
};

describe('particle clock', () => {
  it('runs the same number of steps per real second at 30, 60 and 144 fps', () => {
    for (const fps of [30, 60, 144, 240]) expect(Math.abs(stepsOver(fps, 5) - 5 * PARTICLE_STEPS_PER_SECOND), `${fps} fps`).toBeLessThanOrEqual(1);
  });

  it('carries the remainder instead of dropping it', () => {
    const clock = new ParticleClock();
    const total = Array.from({ length: 10 }, () => clock.advance(3)).reduce((n, v) => n + v, 0);
    expect(total).toBe(3);
  });

  it('caps the steps owed after a hitch', () => {
    const clock = new ParticleClock();
    expect(clock.advance(60000)).toBe(PARTICLE_CLOCK_MAX_STEPS);
    expect(clock.advance(0)).toBe(0);
  });

  it('ignores a negative interval', () => {
    expect(new ParticleClock().advance(-50)).toBe(0);
  });
});
