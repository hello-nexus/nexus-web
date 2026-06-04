// Shared swipe thresholds so the bottom tray (vertical-up reveal) and the page
// pager (horizontal) recognize gestures the same way.

// Minimum travel in the dominant axis before a swipe engages — a small dead
// zone that ignores taps and incidental finger drift.
export const GESTURE_ENGAGE_PX = 16;

// The dominant axis must beat the other by this ratio to claim the gesture;
// near-diagonal drags stay unclaimed until one axis pulls clearly ahead, so a
// page swipe never pops the tray and a drawer pull never flips the page.
export const GESTURE_AXIS_DOMINANCE = 1.3;
