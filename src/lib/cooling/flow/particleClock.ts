/** Particle steps per second of real time: the drawn motion is the same at any frame rate, rotating or idle. */
export const PARTICLE_STEPS_PER_SECOND = 120;
/** After a hitch or a hidden tab the clock owes at most this many steps, so the particles do not leap. */
export const PARTICLE_CLOCK_MAX_STEPS = 6;

/** Turns elapsed real time into whole particle steps, carrying the remainder to the next frame. */
export class ParticleClock {
  private owed = 0;

  /** Whole steps to run for `dtMs` more milliseconds. */
  advance(dtMs: number): number {
    this.owed = Math.min(PARTICLE_CLOCK_MAX_STEPS, this.owed + Math.max(0, dtMs) * (PARTICLE_STEPS_PER_SECOND / 1000));
    const steps = Math.floor(this.owed);
    this.owed -= steps;
    return steps;
  }
}
