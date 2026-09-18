import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { GESTURE_AXIS_DOMINANCE, GESTURE_ENGAGE_PX } from './gestureThresholds';
import { claimGestureAxis, resetGestureAxis } from './gestureAxisLock';
import { bindGestureContacts, useTouchViaPointer, type GestureContact } from './touchViaPointer';

/**
 * iOS-style horizontal page swipe for PanelPager. Tracks pointer drag
 * inside `pagerRef`, returns a per-frame translate offset (in px) so
 * the pager root can render `translateX(-(activeIndex * width) +
 * dragOffset)`. Snaps to the nearest neighbour on release based on
 * distance + velocity thresholds.
 *
 * Direction sign: positive `offset` means the user dragged right (so
 * pages slide right, exposing the previous page on the left).
 *
 * Same in portrait and landscape - the gesture is always horizontal
 * along the visible page edge.
 */

export type HorizontalSwipeState = 'idle' | 'dragging' | 'settling';

interface SwipeOptions {
  enabled: boolean;
  pagerRef: RefObject<HTMLElement | null>;
  pageCount: number;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  // Fraction of the pager width past which a release commits to the
  // next page even at low velocity. Default 0.25 (one-quarter swipe).
  commitDistanceFraction?: number;
  // Pixels per ms of horizontal flick that commits regardless of
  // distance traveled. Default 0.4.
  commitVelocity?: number;
}

interface SwipeResult {
  // 0 means at rest. Positive = dragged right (showing previous page).
  offset: number;
  state: HorizontalSwipeState;
  // Width of one page in CSS pixels, observed from the pager element.
  // Renderer uses this to compute pixel translate.
  pageWidth: number;
}

const SETTLE_MS = 240;

export function usePanelHorizontalSwipe({
  enabled,
  pagerRef,
  pageCount,
  activeIndex,
  onActiveChange,
  commitDistanceFraction = 0.25,
  commitVelocity = 0.4,
}: SwipeOptions): SwipeResult {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<HorizontalSwipeState>('idle');
  const [pageWidth, setPageWidth] = useState(0);
  const touchViaPointer = useTouchViaPointer();
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs read inside the touch listeners so the effect doesn't
  // re-attach on every prop change.
  const activeIndexRef = useRef(activeIndex);
  const pageCountRef = useRef(pageCount);
  const onActiveChangeRef = useRef(onActiveChange);
  const commitDistanceFractionRef = useRef(commitDistanceFraction);
  const commitVelocityRef = useRef(commitVelocity);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  useEffect(() => { onActiveChangeRef.current = onActiveChange; }, [onActiveChange]);
  useEffect(() => { commitDistanceFractionRef.current = commitDistanceFraction; }, [commitDistanceFraction]);
  useEffect(() => { commitVelocityRef.current = commitVelocity; }, [commitVelocity]);

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearSettle(), [clearSettle]);

  // Track pager element width.
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    const update = () => setPageWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pagerRef]);

  useEffect(() => {
    if (!enabled) return;
    const el = pagerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let lastOffset = 0;
    let isDragging = false;

    const onStart = (t: GestureContact) => {
      startX = t.clientX;
      startY = t.clientY;
      lastX = t.clientX;
      lastTime = t.timeStamp;
      velocity = 0;
      lastOffset = 0;
      isDragging = false;
      // A fresh touch releases any axis claim left by the previous gesture.
      resetGestureAxis();
      clearSettle();
    };

    const onMove = (t: GestureContact) => {
      const deltaX = t.clientX - startX;
      const deltaY = t.clientY - startY;

      if (!isDragging) {
        if (Math.abs(deltaX) <= GESTURE_ENGAGE_PX) return;
        // Engage only on a clearly horizontal drag; near-diagonal stays
        // unclaimed so widget scrolling and the bottom-tray swipe can win.
        if (Math.abs(deltaX) <= Math.abs(deltaY) * GESTURE_AXIS_DOMINANCE) return;
        // Claim the gesture's axis; if the tray already owns it (a swipe that
        // started vertical then curved sideways), leave this gesture alone.
        if (!claimGestureAxis('horizontal')) return;
        isDragging = true;
        setState('dragging');
      }

      if (isDragging) {
        t.preventDefault();
        const dt = t.timeStamp - lastTime;
        if (dt > 0) velocity = (t.clientX - lastX) / dt;
        lastX = t.clientX;
        lastTime = t.timeStamp;
        const sign = deltaX < 0 ? -1 : 1;
        const magnitude = Math.max(0, Math.abs(deltaX) - GESTURE_ENGAGE_PX);
        let signed = sign * magnitude;
        // Edge resistance: at the first or last page, halve the offset
        // past the edge so the user feels the wall.
        const idx = activeIndexRef.current;
        const count = pageCountRef.current;
        if ((idx === 0 && signed > 0) || (idx >= count - 1 && signed < 0)) {
          signed = signed / 2;
        }
        lastOffset = signed;
        setOffset(signed);
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      const width = el.clientWidth || 1;
      const idx = activeIndexRef.current;
      const count = pageCountRef.current;
      const distance = Math.abs(lastOffset);
      const flicked = Math.abs(velocity) > commitVelocityRef.current;
      const committed = distance > width * commitDistanceFractionRef.current || flicked;
      let target = idx;
      if (committed) {
        if ((flicked && velocity < 0) || (!flicked && lastOffset < 0)) {
          target = Math.min(count - 1, idx + 1);
        } else {
          target = Math.max(0, idx - 1);
        }
      }
      setState('settling');
      clearSettle();
      if (target !== idx) {
        onActiveChangeRef.current(target);
      }
      setOffset(0);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        setState('idle');
      }, SETTLE_MS);
    };

    return bindGestureContacts(el, touchViaPointer, { start: onStart, move: onMove, end: onEnd });
  }, [enabled, pagerRef, clearSettle, touchViaPointer]);

  return { offset, state, pageWidth };
}
