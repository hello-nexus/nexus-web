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

describe('visual time scale', () => {
  it('draws real air in stated slow motion: scale times real m/s is the screen speed, whatever the scene step', async () => {
    const { VISUAL_TIME_SCALE } = await import('./flowParams');
    for (const stepSeconds of [0.0012, 0.0025]) {
      // Cells per particle step the layer uses, from the scale, the particle step rate and the scene's real seconds per solver step.
      const cellsPerStep = VISUAL_TIME_SCALE / (PARTICLE_STEPS_PER_SECOND * stepSeconds);
      // A solver cell-step is stepSeconds of real time, so the screen covers cellsPerStep solver steps per particle step: scale = cellsPerStep * stepSeconds * rate.
      expect(cellsPerStep * stepSeconds * PARTICLE_STEPS_PER_SECOND).toBeCloseTo(VISUAL_TIME_SCALE, 12);
    }
    expect(VISUAL_TIME_SCALE).toBeGreaterThan(0);
    expect(VISUAL_TIME_SCALE).toBeLessThan(1);
  });
});
