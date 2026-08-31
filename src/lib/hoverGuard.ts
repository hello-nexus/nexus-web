// Runtime half of the app-wide "a click clears the hover" rule. The build
// rewrites every :hover rule to stand down while <html> carries this mark
// (scripts/hover-guard-postcss.ts); all this has to do is put it there on a
// mouse press and take it off once the pointer actually moves again. It is an
// attribute rather than a class because CSS modules would scope a class into
// a per-file hash that nothing here could name.
const HOVER_OFF_ATTR = 'data-nx-hover';

// A mouse never sits perfectly still. Re-arming on the first stray pixel would
// light the button straight back up, so hover only returns after a deliberate
// move.
const MOVE_THRESHOLD_PX = 4;

let originX = 0;
let originY = 0;
let suppressed = false;

function suppress(e: PointerEvent) {
  // Touch and pen have no hover state to clear.
  if (e.pointerType !== 'mouse') return;
  originX = e.clientX;
  originY = e.clientY;
  suppressed = true;
  document.documentElement.setAttribute(HOVER_OFF_ATTR, 'off');
}

function release() {
  if (!suppressed) return;
  suppressed = false;
  document.documentElement.removeAttribute(HOVER_OFF_ATTR);
}

function onMove(e: PointerEvent) {
  if (!suppressed) return;
  if (Math.abs(e.clientX - originX) < MOVE_THRESHOLD_PX
    && Math.abs(e.clientY - originY) < MOVE_THRESHOLD_PX) return;
  release();
}

export function initHoverGuard() {
  // Capture phase: the mark must be up before any handler can re-render and
  // paint the element in its hovered state.
  document.addEventListener('pointerdown', suppress, true);
  document.addEventListener('pointermove', onMove, true);
  // Scrolling slides different elements under a stationary cursor.
  document.addEventListener('wheel', release, { capture: true, passive: true });
}
