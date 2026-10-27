import { STREAK_MAX_MM, STREAK_MIN_MM, STREAK_SEGMENTS, STREAK_STALL_MM, STREAK_STEPS } from './flowParams';

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

/** Ribbon stations of a streak, head first: each station steps backward through the velocity field, so the tail bends where the air bends. Cell coordinates in, cell coordinates out. A station at rest keeps its last direction and a blocked step stays put. Mirrors the walk in the vertex shader. */
export function streakPath(head: Vec3, d: Vec3, cellMm: number, velocityAt: (p: Vec3) => Vec3, solidAt: (p: Vec3) => boolean): Vec3[] {
  const { dir, length } = streakOf(d);
  const stepCells = length / STREAK_SEGMENTS / cellMm;
  let back: Vec3 = [-dir[0], -dir[1], -dir[2]];
  let cur = head;
  const path: Vec3[] = [head];
  for (let k = 0; k < STREAK_SEGMENTS; k++) {
    const v = velocityAt(cur);
    const vm = Math.hypot(v[0], v[1], v[2]);
    if (vm > 1e-5) back = [-v[0] / vm, -v[1] / vm, -v[2] / vm];
    const next: Vec3 = [cur[0] + back[0] * stepCells, cur[1] + back[1] * stepCells, cur[2] + back[2] * stepCells];
    if (!solidAt(next)) cur = next;
    path.push(cur);
  }
  return path;
}
