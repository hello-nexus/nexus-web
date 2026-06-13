// Shared swipe thresholds so the bottom tray (vertical-up reveal) and the page
// pager (horizontal) recognize gestures the same way.

// Minimum travel in the dominant axis before a swipe engages — a small dead
// zone that ignores taps and incidental finger drift.
export const GESTURE_ENGAGE_PX = 16;

// The dominant axis must beat the other by this ratio to claim the gesture;
// near-diagonal drags stay unclaimed until one axis pulls clearly ahead, so a
// page swipe never pops the tray and a drawer pull never flips the page.
export const GESTURE_AXIS_DOMINANCE = 1.3;

// Tray-open thresholds as physical finger travel, converted to CSS px per
// surface via cssPxPerMm (panelGrid). A fixed CSS-px threshold opens the tray
// with much less movement on the Y70 than on a phone because a Y70 CSS px is
// denser finger travel; pinning the physical distance equalizes the open
// gesture across surfaces (and tracks live Windows display scaling, since
// cssPxPerMm divides by devicePixelRatio). The engage dead zone is converted
// the same way so both halves of the open drag are physical.
export const TRAY_ENGAGE_TRAVEL_MM = 2.5;
export const TRAY_COMMIT_TRAVEL_MM = 10;
export const TRAY_COMMIT_FLICK_MM_PER_MS = 0.075;
