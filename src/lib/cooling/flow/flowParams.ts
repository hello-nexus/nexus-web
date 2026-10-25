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
/** Cells whose axial distance to a fan disk centre is within this many cells receive its force. */
export const MIN_FAN_HALF_THICKNESS_CELLS = 1;

/** Air outside the case is simulated this far past each side that has a fan or vent. */
export const DOMAIN_MARGIN_MM = 100;
/** A fan or vent within this distance of a case face puts its margin on that side. */
export const MOUNT_REACH_MM = 60;
/** Heat a particle gains per step inside a cell next to a heat source, and inside a porous cooler cell. */
export const HEAT_RATE_NEAR = 0.015;
export const HEAT_RATE_POROUS = 0.03;
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
export const MAX_SPAWN_POINTS = 2048;

/** Particles move this many times faster than the solver's own time, so the flow reads clearly; fan-to-fan differences stay proportional. */
export const PARTICLE_SPEED_SCALE = 1.5;
export const PARTICLE_SPEED_MIN = 0.5;
export const PARTICLE_SPEED_MAX = 3;
/** Longest advection sub-step, in cells: under one cell so a particle cannot skip a one-cell wall. */
export const MAX_SUBSTEP_CELLS = 0.7;
/** Advection sub-steps per particle step at a visual speed scale: enough that the fastest cell moves at most MAX_SUBSTEP_CELLS per sub-step. */
export const substepsFor = (speed: number) => Math.min(8, Math.max(1, Math.ceil((speed * VMAX_CELLS) / MAX_SUBSTEP_CELLS)));
/** A particle that moves less than this many cells per step ages this many times faster, so one stuck in dead air or against a wall is soon recycled. */
export const STUCK_MOVE_CELLS = 0.015;
export const STUCK_AGE_RATE = 20;

/** Air older than this many straight-through times counts as a dead zone; younger air shows as a faint age gradient. */
export const DEAD_AGE_RATIO = 5;

/** Intake particles start this many cells outward of the fan, spread over this depth. */
export const SPAWN_BACK_MIN_CELLS = 1.5;
/** Intake particles start anywhere in the tube of outside air this deep, mm, in front of the fan's opening. */
export const SPAWN_OUT_REACH_MM = 60;
/** Emitter entries per 60 CFM of flow, within these bounds: a stronger fan sends proportionally more particles. */
export const EMITTERS_PER_60_CFM = 16;
export const MAX_EMITTER_ENTRIES = 256;
