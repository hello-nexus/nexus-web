// A touch is a single finger, so a gesture has a single axis. Once the tray
// (vertical) or the pager (horizontal) claims a drag, the other yields for the
// rest of that touch - so a drawer pull that curves sideways never also flips
// the page, and a page swipe that drifts upward never pops the drawer.
//
// Module-level because there is only ever one active touch on the panel; both
// hooks reset the claim on touchstart, so it can never leak across gestures.
export type GestureAxis = 'horizontal' | 'vertical';

let claimed: GestureAxis | null = null;

// Release the previous gesture's claim. Call from every touchstart.
export function resetGestureAxis(): void {
  claimed = null;
}

// Claim the in-flight gesture for `axis`. Returns false if the other axis
// already owns it (so the caller should yield); idempotent for the owner.
export function claimGestureAxis(axis: GestureAxis): boolean {
  if (claimed && claimed !== axis) return false;
  claimed = axis;
  return true;
}
