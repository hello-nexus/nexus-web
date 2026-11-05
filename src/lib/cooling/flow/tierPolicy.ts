/** When the solver grid steps down a tier and when it climbs back; pure, so it is tested without a GPU. */

/** A frame longer than this counts as slow. */
export const SLOW_FRAME_MS = 30;
/** Net slow frames, at the fewest solver steps per frame, before the grid steps down. */
export const SLOW_FRAMES = 24;
/** The solver must account for at least this share of a slow frame for a coarser grid to help. */
export const SOLVER_SHARE = 0.5;
/** A finer tier is tried again only when its predicted step costs no more than this share of the solver's frame budget. */
export const CLIMB_BUDGET_SHARE = 0.5;
/** Without GPU timing, a finer tier is tried again only while settled frames stay under this length, ms: above the calm view's own frame length, so a view that keeps up passes. */
export const CLIMB_FRAME_MS = 40;
/** The wait after a step down before the grid may climb, ms; it doubles, up to the cap, whenever a climb is undone soon after. */
export const CLIMB_HOLD_MS = 120000;
export const CLIMB_HOLD_MAX_MS = 1800000;
/** A step down within this long of a climb counts as that climb being undone, ms. */
export const CLIMB_FAIL_MS = 120000;
/** After a climb the next one waits this long, ms, so each climb's outcome shows before another starts. */
export const CLIMB_SETTLE_MS = 20000;
/** A frame gap longer than this is a hidden tab or a paused loop, not a frame length, ms. */
export const FRAME_GAP_MAX_MS = 250;

/** Whether the solver is what made a frame slow: always when its cost is unknown (no GPU timing), else when its steps took a large share of the frame. */
export function solverIsCause(frameMs: number, msPerStep: number, steps: number): boolean {
  if (!(msPerStep > 0)) return true;
  return msPerStep * steps >= SOLVER_SHARE * frameMs;
}

/** Cost of one step at a finer tier, ms, scaled from the measured cost at this one by the cell counts. */
export const predictedStepMs = (msPerStep: number, cellsHere: number, cellsFiner: number): number => (cellsHere > 0 ? msPerStep * (cellsFiner / cellsHere) : 0);

/** Decides when a settled layer may climb back a tier, with a hold-off that grows while climbs keep being undone. */
export class TierGovernor {
  private holdUntil = 0;
  private holdMs = CLIMB_HOLD_MS;
  private climbedAt = Number.NEGATIVE_INFINITY;

  /** The grid stepped down at `now`. */
  noteDrop(now: number) {
    // A climb undone soon after doubles the wait; any other drop starts from the base wait again.
    this.holdMs = now - this.climbedAt < CLIMB_FAIL_MS ? Math.min(CLIMB_HOLD_MAX_MS, this.holdMs * 2) : CLIMB_HOLD_MS;
    this.holdUntil = now + this.holdMs;
  }

  /** The grid climbed at `now`. */
  noteClimb(now: number) {
    this.climbedAt = now;
    this.holdUntil = now + CLIMB_SETTLE_MS;
  }

  /** Whether to climb: the hold-off has passed and the finer tier's step fits (`predictedMs`), or, with no GPU timing (`predictedMs` 0), settled frames are short (`frameMs`). */
  mayClimb(now: number, predictedMs: number, budgetMs: number, frameMs: number): boolean {
    if (now < this.holdUntil) return false;
    return predictedMs > 0 ? predictedMs <= budgetMs * CLIMB_BUDGET_SHARE : frameMs > 0 && frameMs < CLIMB_FRAME_MS;
  }
}
