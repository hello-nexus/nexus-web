/** Blades on a rotor: its pattern repeats every turn over this many, so the angle only needs to be known modulo one blade's share of a turn. */
export const ROTOR_BLADES = 5;
export const ROTOR_PERIOD = (2 * Math.PI) / ROTOR_BLADES;
/** Seconds the turn rate takes to close most of the gap to a new rpm, so a speed change is a ramp and never a step. */
const RATE_EASE_SECONDS = 0.35;

export interface RotorSpin {
  /** Angle in [0, ROTOR_PERIOD), radians. */
  angle: number;
  /** The turn rate in use, turns a second, easing toward the target. */
  rate: number;
}

/** Advances a rotor: the angle integrates the eased rate and wraps by one blade period, so an rpm change never moves the blades. `sign` is the spin direction; with no previous state the rate starts at the target. */
export function advanceRotor(prev: RotorSpin | undefined, dtSeconds: number, targetTurnsPerSecond: number, sign: number): RotorSpin {
  const dt = Math.max(0, dtSeconds);
  const rate = prev === undefined ? targetTurnsPerSecond : targetTurnsPerSecond + (prev.rate - targetTurnsPerSecond) * Math.exp(-dt / RATE_EASE_SECONDS);
  const angle = (prev?.angle ?? 0) + sign * rate * 2 * Math.PI * dt;
  const wrapped = angle - Math.floor(angle / ROTOR_PERIOD) * ROTOR_PERIOD;
  return { angle: wrapped >= ROTOR_PERIOD ? 0 : wrapped, rate };
}
