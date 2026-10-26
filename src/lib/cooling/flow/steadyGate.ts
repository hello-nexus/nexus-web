/** Decides when a solve is steady, ignoring any check that began before the latest edit. */
export class SteadyGate {
  private edit = 0;
  private started = -1;

  /** An edit made earlier checks stale. */
  invalidate() {
    this.edit++;
    this.started = -1;
  }

  /** Marks a check as begun on the current edit. */
  begin() {
    this.started = this.edit;
  }

  /** Whether a finished check with these velocity numbers ends the solve: it must belong to the current edit and show the change under the ratio. */
  settles(du: number, u: number, ratio: number): boolean {
    if (this.started !== this.edit) return false;
    return u > 1e-6 && du < ratio * u;
  }
}
