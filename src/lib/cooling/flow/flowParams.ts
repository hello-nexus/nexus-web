/** Tuning shared by the GPU solver and its CPU reference. Velocities are cells per step. */
export const CFL_TARGET = 0.5;
/** Hard velocity bound, below one cell per step so semi-Lagrangian backtraces stay inside one cell. */
export const VMAX_CELLS = 0.9;
export const JACOBI_ITERATIONS = 30;
/** Per-step blend of a fan cell's velocity toward its target; at most 1, so the penalization cannot overshoot. */
export const FAN_BLEND = 0.6;
/** Darcy drag per step inside a porous (radiator or cooler) cell. */
export const DARCY_K = 0.4;
/** Per-step velocity damping. */
export const DAMPING = 0.999;
/** Floor of the reference fan velocity, m/s, so a weak setup does not look as fast as a strong one. */
export const MIN_REFERENCE_SPEED = 2;
/** Cells whose axial distance to a fan disk center is within this many cells receive its force. */
export const MIN_FAN_HALF_THICKNESS_CELLS = 1;

/** Air outside the case is simulated this far past each side that has a fan or vent. */
export const DOMAIN_MARGIN_MM = 100;
/** A fan or vent within this distance of a case face puts its margin on that side. */
export const MOUNT_REACH_MM = 60;
/** Average room air, C: all intake and outside air is this warm, and it is the reference the buoyancy force is measured from. */
export const ROOM_TEMP_C = 22;
/** Share of the gap between a part and the air that the air closes per solver step inside the part's heat cells. The air never passes the part's own temperature, and air already warm gains less. */
export const HEAT_COUPLING = 0.05;
/** Boussinesq coefficient: upward acceleration, in cells per step squared, per degree the air is above room temperature (cooler air sinks by the same law). Small enough that a fan's own stream still dominates. */
export const BUOYANCY = 0.00002;
/** A part this many degrees above room temperature counts as hot: with no fan running it still drives a rising plume. */
export const BUOYANCY_MIN_RISE_K = 1;
/** A hot part's temperature must move this many degrees before an idle solve wakes again. */
export const TEMP_RESUME_DELTA_K = 3;
/** Fewest solver steps after an edit or a temperature change before a hot case may count as settled: the temperature field settles slower than the velocity. */
export const TEMP_SETTLE_STEPS = 600;
/** Most plume emitter entries over a hot part's top cells. */
export const PLUME_EMITTERS_MAX = 24;
/** Air this many degrees above room temperature is drawn in the full hot color. */
export const HEAT_COLOR_SPAN_C = 40;
/** Fluid cells this close to a heat-source solid are its heat cells. */
export const HEAT_REACH_CELLS = 2;
/** Particle age, in steps, after which it is recycled. */
export const PARTICLE_MAX_AGE = 900;
/** Each particle lives the max age times 1 plus or minus this share, so deaths and respawns spread evenly instead of arriving in waves. */
export const PARTICLE_LIFE_JITTER = 0.5;
/** The first pool is born over this share of the max age: until its birth a particle waits unseen at its spawn point. */
export const PARTICLE_BIRTH_SPREAD = 0.3;

export const GRID_TARGET_CELLS = 64 * 48 * 96;
export const GRID_LOW_CELLS = 32 * 24 * 48;
export const MAX_GRID_AXIS = 128;
export const MIN_GRID_AXIS = 8;

/** Particles move this many times faster than the solver's own time, so the flow reads clearly; fan-to-fan differences stay proportional. */
export const PARTICLE_SPEED_SCALE = 1.5;
/** Longest advection sub-step, in cells: under one cell so a particle cannot skip a one-cell wall. */
export const MAX_SUBSTEP_CELLS = 0.7;
/** Advection sub-steps per particle step at a visual speed scale: enough that the fastest cell moves at most MAX_SUBSTEP_CELLS per sub-step. */
export const substepsFor = (speed: number) => Math.min(8, Math.max(1, Math.ceil((speed * VMAX_CELLS) / MAX_SUBSTEP_CELLS)));
/** A particle that moves less than this many cells per step ages this many times faster, so one stuck in dead air or against a wall is soon recycled. */
export const STUCK_MOVE_CELLS = 0.015;
export const STUCK_AGE_RATE = 20;

/** Emitter entries per 60 CFM of flow, within these bounds: a stronger fan sends proportionally more particles. */
export const EMITTERS_PER_60_CFM = 16;
export const MAX_EMITTER_ENTRIES = 256;
/** Most entries one fan may hold, and the minimum every spinning fan gets. */
export const MAX_EMITTERS_PER_FAN = 64;
export const MIN_EMITTERS_PER_FAN = 4;
/** Rejection-sampling attempts per spawn before the particle waits a frame. */
export const SPAWN_TRIES = 6;

/** Floats per emitter entry: centre xyz, hub radius, axis xyz, tip radius, first ring axis xyz, outward offset, outward spread, three unused. */
export const EMITTER_STRIDE = 16;
/** How far outside a case face the air is drawn, mm, about one fan diameter and under the domain margin. Intake particles start this far out and exhaust particles are recycled once they travel this far, and a fan's own force reaches this far out so the air outside follows it. */
export const OUTSIDE_REACH_MM = 90;
/** Share of an intake's outside reach, from the face, where its particles start: nearest and farthest. */
export const OUTSIDE_SPAWN_FROM = 0.45;
export const OUTSIDE_SPAWN_TO = 0.9;
/** Share of the particle pool that is drawn; the rest is simulated but hidden, so the picture stays readable. */
export const PARTICLE_DRAW_SHARE = 0.5;
/** How many of a pool's particles are drawn at a tier's share of it. */
export const drawnParticles = (pool: number, tierShare: number) => Math.round(pool * tierShare * PARTICLE_DRAW_SHARE);
/** Room kept clear of solid cells on both sides of a fan, mm beyond its own thickness: a collision shape or plate never closes a fan's disc, though the card, radiator and PSU still deflect air farther away. */
export const FAN_CLEARANCE_MM = 30;

/** Velocity streaks: each particle is drawn as a line along its last step's displacement, the tail this many steps of travel behind the head. */
export const STREAK_STEPS = 10;
/** Streak length bounds, scene mm: a stalled particle keeps the minimum, a fast one is capped at the maximum. */
export const STREAK_MIN_MM = 3;
export const STREAK_MAX_MM = 70;
/** Streak width in scene mm, and the narrowest it is drawn on screen, px. */
export const STREAK_WIDTH_MM = 3;
export const STREAK_MIN_WIDTH_PX = 1.5;
/** Steps shorter than this many mm have no usable direction, so the streak takes a fixed axis. */
export const STREAK_STALL_MM = 1e-4;
