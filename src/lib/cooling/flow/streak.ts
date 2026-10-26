import { STREAK_MAX_MM, STREAK_MIN_MM, STREAK_STALL_MM, STREAK_STEPS } from './flowParams';

export type Vec3 = [number, number, number];

/** Axis a stalled particle's stub points along. */
export const STALLED_AXIS: Vec3 = [1, 0, 0];

/** Displacement of one step in mm from cell-coordinate positions. A particle that respawned (age did not grow) or has no position has not moved. Mirrors `stepDisplacement` in the vertex shader. */
export function stepDisplacement(prev: ArrayLike<number>, pos: ArrayLike<number>, prevAge: number, age: number, cellMm: number): Vec3 {
  if (prev[0] < -1e5 || pos[0] < -1e5 || prevAge >= age) return [0, 0, 0];
  return [(pos[0] - prev[0]) * cellMm, (pos[1] - prev[1]) * cellMm, (pos[2] - prev[2]) * cellMm];
}

/** Streak direction (unit) and length (mm) from a step's displacement in mm: length follows speed between the bounds. Mirrors `streakOf` in the vertex shader. */
export function streakOf(d: Vec3): { dir: Vec3; length: number } {
  const m = Math.hypot(d[0], d[1], d[2]);
  const dir: Vec3 = m > STREAK_STALL_MM ? [d[0] / m, d[1] / m, d[2] / m] : STALLED_AXIS;
  return { dir, length: Math.min(STREAK_MAX_MM, Math.max(STREAK_MIN_MM, m * STREAK_STEPS)) };
}

/** Head and tail of a streak: the head is the particle, the tail trails behind its motion. */
export function streakEnds(head: Vec3, d: Vec3): { head: Vec3; tail: Vec3 } {
  const { dir, length } = streakOf(d);
  return { head, tail: [head[0] - dir[0] * length, head[1] - dir[1] * length, head[2] - dir[2] * length] };
}
