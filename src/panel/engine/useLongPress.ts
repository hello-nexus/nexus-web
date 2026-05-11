import { useCallback, useRef } from 'react';

interface LongPressResult {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  firedRef: React.RefObject<boolean>;
}

const HOLD_MS = 500;
const MOVE_THRESHOLD = 8;

export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  holdMs = HOLD_MS,
): LongPressResult {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    firedRef.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    cancel();
    // Long-press is a touch / pen affordance. Mouse devices have right-click
    // for the same gating intent, so a left-mouse hold should not arm the
    // context menu - it would conflict with the user holding to start a drag.
    if (e.pointerType === 'mouse') return;
    const cx = e.clientX;
    const cy = e.clientY;
    timer.current = setTimeout(() => {
      timer.current = null;
      firedRef.current = true;
      onLongPress(cx, cy);
    }, holdMs);
  }, [onLongPress, cancel, holdMs]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!timer.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      cancel();
    }
  }, [cancel]);

  const onPointerUp = useCallback(() => cancel(), [cancel]);
  const onPointerCancel = useCallback(() => cancel(), [cancel]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, firedRef };
}
