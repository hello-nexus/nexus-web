/**
 * Clip-scheduled effect events. A pack's animations may carry
 * `extras.events` (the shapes below), which GLTFLoader copies to
 * `clip.userData.events`; the runtime fires each one when the playing
 * action's time crosses `t`.
 *
 * Positions and directions are in the model's scene space (the GLB scene
 * root's local frame); the runtime maps them through the character root.
 */

export type Vec3 = [number, number, number];
export type FxKind = 'heart' | 'sparkle' | 'note' | 'z' | 'petal';

interface EventBase {
  /** Clip time (seconds) the event fires at. */
  t: number;
  kind: FxKind;
  /** World size (m) of one particle. */
  size: number;
  seed?: number;
}

/** One particle that pops in (overshoot), rises and fades. */
export interface PopEvent extends EventBase {
  type: 'pop';
  at: Vec3;
  life: number;
  /** Upward drift over the lifetime (m). */
  rise: number;
  up: Vec3;
}

/** `count` particles flung out from `at` within the plane spanned by `axes`. */
export interface BurstEvent extends EventBase {
  type: 'burst';
  at: Vec3;
  count: number;
  speed: number;
  life: number;
  axes: [Vec3, Vec3];
  /** Per-second velocity damping. */
  drag?: number;
}

/**
 * Particles emitted at `rate` per second for `duration` seconds, from a bone
 * (plus `boneTip` meters along it) or a fixed point, optionally jittered
 * within a box, drifting with `velocity` and swaying along `swayAxis`.
 */
export interface StreamEvent extends EventBase {
  type: 'stream';
  duration: number;
  rate: number;
  life: number;
  bone?: string;
  boneTip?: number;
  at?: Vec3;
  offset?: Vec3;
  /** Half-extents of the spawn box, along `boxAxes`. */
  box?: Vec3;
  boxAxes?: [Vec3, Vec3, Vec3];
  velocity?: Vec3;
  sway?: number;
  swayAxis?: Vec3;
  /** Size grows by this factor over the lifetime (1 = constant). */
  grow?: number;
  /** Spin speed (radians/second, random sign). */
  spin?: number;
}

/** A single particle following sampled positions (seconds since the event). */
export interface PathEvent extends EventBase {
  type: 'path';
  times: number[];
  /** Flat xyz per sample. */
  pos: number[];
  roll: number[];
}

export type FxEvent = PopEvent | BurstEvent | StreamEvent | PathEvent;

/**
 * Events due between two clip times. `prev` is the previous frame's time
 * (negative for a freshly started action so events at 0 fire); a `now`
 * below `prev` means the looping action wrapped past its end.
 */
export function eventsBetween<T extends { t: number }>(events: readonly T[], prev: number, now: number): T[] {
  if (now >= prev) return events.filter((e) => e.t > prev && e.t <= now);
  return events.filter((e) => e.t > prev || e.t <= now);
}
