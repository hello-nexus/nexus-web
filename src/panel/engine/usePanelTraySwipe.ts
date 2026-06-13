import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { GESTURE_AXIS_DOMINANCE, GESTURE_ENGAGE_PX } from './gestureThresholds';
import { claimGestureAxis, resetGestureAxis } from './gestureAxisLock';
import { triggerHaptic } from '../device/panelNativeBridge';

/**
 * Light upward-swipe gesture that reveals the panel actions tray. Lands
 * on the same surface as the page pager, so:
 *
 *  - Defers to widget content scrollers: any touch starting inside an
 *    element marked `[data-panel-scrollable="true"]` is ignored so the
 *    widget keeps owning its vertical scroll (e.g. lighting carousel).
 *  - Defers to the page pager: engages only on a clearly vertical-up drag
 *    (dy > |dx| * dominance) and then claims the gesture's axis, so a
 *    horizontal page swipe is never also read as a tray pull and vice-versa
 *    (see gestureAxisLock).
 *  - Ignores starts inside the iOS home-indicator handoff band: the
 *    system steals these gestures to background the app, and the
 *    trailing-edge events on return commit the tray. See
 *    `bottomEdgeIgnorePx`.
 *
 * `onCommit` fires once the gesture crosses the commit threshold; the
 * host opens the tray. The hook does not own the tray's open/close
 * state - the host is the source of truth.
 */

export type TraySwipeState = 'idle' | 'dragging' | 'settling';

interface TraySwipeOptions {
  enabled: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  // Dead zone the drag must clear before it engages and starts counting toward
  // the commit distance. Default GESTURE_ENGAGE_PX (shared with the pager).
  engageDistancePx?: number;
  // Pixels the user must lift past before the gesture commits. Default 48.
  commitDistancePx?: number;
  // Pixels per ms upward flick that commits regardless of distance. Default 0.45.
  commitVelocity?: number;
  // Touches starting within this many CSS px of the viewport bottom are
  // ignored: that band is the iOS home-indicator handoff zone, and a
  // user-initiated tray-open always starts higher up on the surface
  // anyway.
  bottomEdgeIgnorePx?: number;
  onCommit?: () => void;
  onCancel?: () => void;
}

interface TraySwipeResult {
  // Pixels lifted above the start point while dragging. 0 when idle.
  offset: number;
  state: TraySwipeState;
  reset: () => void;
}

const SETTLE_MS = 220;

export function usePanelTraySwipe({
  enabled,
  surfaceRef,
  engageDistancePx = GESTURE_ENGAGE_PX,
  commitDistancePx = 48,
  commitVelocity = 0.45,
  bottomEdgeIgnorePx = 28,
  onCommit,
  onCancel,
}: TraySwipeOptions): TraySwipeResult {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<TraySwipeState>('idle');
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const engageDistanceRef = useRef(engageDistancePx);
  const commitDistanceRef = useRef(commitDistancePx);
  const commitVelocityRef = useRef(commitVelocity);
  const bottomEdgeIgnoreRef = useRef(bottomEdgeIgnorePx);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { engageDistanceRef.current = engageDistancePx; }, [engageDistancePx]);
  useEffect(() => { commitDistanceRef.current = commitDistancePx; }, [commitDistancePx]);
  useEffect(() => { commitVelocityRef.current = commitVelocity; }, [commitVelocity]);
  useEffect(() => { bottomEdgeIgnoreRef.current = bottomEdgeIgnorePx; }, [bottomEdgeIgnorePx]);

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearSettle();
    setOffset(0);
    setState('idle');
  }, [clearSettle]);

  useEffect(() => () => clearSettle(), [clearSettle]);

  useEffect(() => {
    if (!enabled) return;
    const el = surfaceRef.current;
    if (!el) return;

    let startY = 0;
    let startX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let lastOffset = 0;
    let isDragging = false;
    // One-shot per gesture: fire a detent haptic the instant the drag crosses
    // the commit distance (re-armed if it drops back below), so the user feels
    // the moment the tray is committed to opening.
    let committedHaptic = false;
    // Set at touchstart - if true, this gesture is yielded for its
    // entire lifetime: either to a widget's own scroller, or because
    // it began inside the iOS home-indicator handoff band. Sticky so
    // we never mid-drag steal the gesture back.
    let yielded = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = t.target instanceof Element ? t.target : null;
      // Yield ONLY to widget content scrollers. Interactive controls
      // (button, slider, etc.) are NOT yielded here - the engage check
      // in onMove gates tray-up on a vertical-up dominant gesture, so
      // a horizontal slider drag (horizontal-dominant) still passes
      // through to the slider's own pointer handlers without being
      // preventDefault'd. Yielding to interactive controls here would
      // suppress tray-up over most widget content, since widgets are
      // dense with buttons / sliders / etc.
      const overScrollable = Boolean(target?.closest('[data-panel-scrollable="true"]'));
      // iOS home-indicator handoff band: the system claims swipe-ups
      // that start here to background the app; the trailing-edge events
      // on return would commit the tray.
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const inBottomEdge = viewportH - t.clientY < bottomEdgeIgnoreRef.current;
      yielded = overScrollable || inBottomEdge;
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;
      lastTime = e.timeStamp;
      velocity = 0;
      lastOffset = 0;
      isDragging = false;
      committedHaptic = false;
      // A fresh touch releases any axis claim left by the previous gesture.
      resetGestureAxis();
      clearSettle();
    };

    const onMove = (e: TouchEvent) => {
      if (yielded) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const deltaY = startY - t.clientY; // upward = positive
      const deltaX = t.clientX - startX;

      if (!isDragging) {
        if (deltaY <= engageDistanceRef.current) return;
        // Engage only on a clearly vertical-up drag; near-diagonal stays
        // unclaimed so a mostly-horizontal swipe is left to the pager.
        if (deltaY <= Math.abs(deltaX) * GESTURE_AXIS_DOMINANCE) return;
        // Claim the gesture's axis. If the pager already owns it (a swipe that
        // started horizontal then curved up), yield for the rest of this touch.
        if (!claimGestureAxis('vertical')) { yielded = true; return; }
        isDragging = true;
        setState('dragging');
      }

      if (isDragging) {
        if (e.cancelable) e.preventDefault();
        const dt = e.timeStamp - lastTime;
        if (dt > 0) velocity = (lastY - t.clientY) / dt; // upward = positive
        lastY = t.clientY;
        lastTime = e.timeStamp;
        const lifted = Math.max(0, deltaY - engageDistanceRef.current);
        lastOffset = lifted;
        setOffset(lifted);
        if (lifted > commitDistanceRef.current) {
          if (!committedHaptic) { committedHaptic = true; triggerHaptic('medium'); }
        } else {
          committedHaptic = false;
        }
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      const flicked = velocity > commitVelocityRef.current;
      const committed = lastOffset > commitDistanceRef.current || flicked;
      setState('settling');
      clearSettle();
      if (committed) {
        setOffset(commitDistanceRef.current);
        onCommitRef.current?.();
      } else {
        setOffset(0);
        onCancelRef.current?.();
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          setState('idle');
        }, SETTLE_MS);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, surfaceRef, clearSettle]);

  return { offset, state, reset };
}
