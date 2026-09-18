import { useEffect } from 'react';
import { GESTURE_AXIS_DOMINANCE, GESTURE_ENGAGE_PX } from './gestureThresholds';
import { claimGestureAxis, resetGestureAxis } from './gestureAxisLock';
import { PANEL_CONTEXT_MENU_TRIGGER_MS } from './usePanelTouchMode';
import { findScroller } from './scrollers';

// Momentum after release: per-frame velocity retention and the speed below
// which the glide stops.
const GLIDE_DECAY = 0.94;
const GLIDE_STOP_PX_PER_MS = 0.04;

/**
 * Finger-style scrolling of whatever overflow container the press lands in,
 * driven by a mouse drag, for the host where the "mouse" is a touchscreen (see
 * engine/touchViaPointer). Yields to the sheet-dismiss gesture the way
 * native scrolling does (a downward pull on a pane already at its top), and
 * to dnd-kit once a press has lasted long enough to arm a widget drag.
 *
 * Listens on the document: the editor sheet and other overlays mount
 * outside the panel root, and a finger scrolls those too.
 */
export function usePanelDragScroll(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const root = document.body;

    // Candidate per axis, chosen at engage time by the drag's dominant axis.
    let scrollerY: HTMLElement | null = null;
    let scrollerX: HTMLElement | null = null;
    let scroller: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startLeft = 0;
    let lastY = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocityY = 0;
    let velocityX = 0;
    let engaged = false;
    let downTime = 0;
    let dndMayArm = false;
    let swallowClick = false;
    let glide: number | null = null;

    const stopGlide = () => {
      if (glide !== null) { cancelAnimationFrame(glide); glide = null; }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !e.isPrimary || e.button !== 0) return;
      // Any new press clears a pending swallow, whether or not it scrolls.
      swallowClick = false;
      const target = e.target instanceof Element ? e.target : null;
      scrollerY = findScroller(target, root, 'y');
      scrollerX = findScroller(target, root, 'x');
      scroller = null;
      if (!scrollerY && !scrollerX) return;
      stopGlide();
      // The cell drag activator skips presses inside a marked pane, so only
      // a press elsewhere can turn into a widget drag after the hold - except
      // inside a sortable, which carries its own drag context (media grid).
      dndMayArm = !target?.closest('[data-panel-scrollable="true"]')
        || Boolean(target?.closest('[aria-roledescription="sortable"]'));
      // Every gesture start releases the previous claim (gestureAxisLock).
      resetGestureAxis();
      downTime = e.timeStamp;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      startTop = scrollerY?.scrollTop ?? 0;
      startLeft = scrollerX?.scrollLeft ?? 0;
      lastTime = e.timeStamp;
      velocityX = velocityY = 0;
      engaged = false;
    };

    const abandon = () => { scrollerY = null; scrollerX = null; scroller = null; };

    const onPointerMove = (e: PointerEvent) => {
      if ((!scrollerY && !scrollerX) || e.pointerType !== 'mouse') return;
      if ((e.buttons & 1) === 0) { finish(); return; }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!engaged) {
        // Past the long-press mark dnd-kit has armed a widget drag; the
        // press belongs to it now.
        if (dndMayArm && e.timeStamp - downTime >= PANEL_CONTEXT_MENU_TRIGGER_MS) { abandon(); return; }
        const vertical = Math.abs(dy) > GESTURE_ENGAGE_PX && Math.abs(dy) > Math.abs(dx) * GESTURE_AXIS_DOMINANCE;
        const horizontal = Math.abs(dx) > GESTURE_ENGAGE_PX && Math.abs(dx) > Math.abs(dy) * GESTURE_AXIS_DOMINANCE;
        if (!vertical && !horizontal) return;
        const candidate = vertical ? scrollerY : scrollerX;
        // At the top and pulling down: that is the sheet's dismiss
        // gesture, not a scroll.
        if (!candidate || (vertical && dy > 0 && candidate.scrollTop <= 0)) { abandon(); return; }
        if (!claimGestureAxis(vertical ? 'vertical' : 'horizontal')) { abandon(); return; }
        scroller = candidate;
        engaged = true;
      }
      if (!scroller) return;
      const dt = e.timeStamp - lastTime;
      if (dt > 0) {
        velocityY = (e.clientY - lastY) / dt;
        velocityX = (e.clientX - lastX) / dt;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = e.timeStamp;
      if (scroller === scrollerY) scroller.scrollTop = startTop - dy;
      else scroller.scrollLeft = startLeft - dx;
    };

    // The click that lands where an engaged scroll ends is swallowed: a
    // finger scroll never activates the control it happens to stop on. The
    // flag is armed by finish() and cleared by the click itself or the next
    // press, so a release with no click cannot leave a stale swallow.
    const onClickCapture = (ev: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    };

    const finish = () => {
      const el = scroller;
      const wasEngaged = engaged;
      const alongY = scroller === scrollerY;
      abandon();
      engaged = false;
      if (!el || !wasEngaged) return;
      swallowClick = true;
      let vy = velocityY;
      let vx = velocityX;
      let prev = performance.now();
      const step = (now: number) => {
        const dt = now - prev;
        prev = now;
        if (alongY) el.scrollTop -= vy * dt; else el.scrollLeft -= vx * dt;
        vy *= GLIDE_DECAY;
        vx *= GLIDE_DECAY;
        if (Math.abs(vy) < GLIDE_STOP_PX_PER_MS && Math.abs(vx) < GLIDE_STOP_PX_PER_MS) { glide = null; return; }
        glide = requestAnimationFrame(step);
      };
      if (Math.abs(vy) >= GLIDE_STOP_PX_PER_MS || Math.abs(vx) >= GLIDE_STOP_PX_PER_MS) glide = requestAnimationFrame(step);
    };

    const onPointerEnd = (e: PointerEvent) => { if (e.pointerType === 'mouse') finish(); };

    // Capture phase, so a component that stops propagation on its own
    // presses cannot hide a scrollable pane from the finger.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      stopGlide();
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
    };
  }, [enabled]);
}
