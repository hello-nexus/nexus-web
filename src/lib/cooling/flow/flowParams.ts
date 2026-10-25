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
