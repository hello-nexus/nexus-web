import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

export const LOCK_DRAG_THRESHOLD_PX = 6;
export const LOCK_HOLD_MS = 450;
export const LOCK_NOTICE_MS = 1400;

const INTERACTIVE = 'button,a,input,select,textarea,summary,[role="button"],[role="slider"],[role="switch"],[role="tab"],[data-panel-scrollable="true"]';

/** True when the press landed on a widget's own control, which keeps working on a locked widget. */
export function isOwnControl(target: EventTarget | null, cell: Element | null = null): boolean {
  if (!(target instanceof Element)) return false;
  const hit = target.closest(INTERACTIVE);
  // The sortable cell carries role="button" itself; only a control inside it counts.
  return hit !== null && hit !== cell;
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > LOCK_DRAG_THRESHOLD_PX;
}

/**
 * Pointer handlers that surface a "locked" notice when someone tries to move or edit a locked widget:
 * a press dragged past the threshold, a hold, or a tap on the widget body. Pressing a control inside
 * the widget never triggers it. Inert when `locked` is false.
 */
export function useLockNotice(locked: boolean) {
  const [visible, setVisible] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const clearHold = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
  }, []);
  const show = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), LOCK_NOTICE_MS);
  }, []);
  const end = useCallback(() => {
    clearHold();
    start.current = null;
  }, [clearHold]);

  useEffect(() => () => {
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(hideTimer.current);
  }, []);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (!locked || isOwnControl(e.target, e.currentTarget as Element)) return;
    start.current = { x: e.clientX, y: e.clientY };
    clearHold();
    holdTimer.current = window.setTimeout(show, LOCK_HOLD_MS);
  }, [clearHold, locked, show]);
  const onPointerMove = useCallback((e: PointerEvent) => {
    const origin = start.current;
    if (!locked || !origin) return;
    if (exceedsDragThreshold(e.clientX - origin.x, e.clientY - origin.y)) {
      clearHold();
      show();
    }
  }, [clearHold, locked, show]);
  const onPointerUp = useCallback((e: PointerEvent) => {
    const origin = start.current;
    end();
    if (!locked || !origin) return;
    // A press that never moved is a tap on the body; the hold timer already covered a long one.
    if (!exceedsDragThreshold(e.clientX - origin.x, e.clientY - origin.y)) show();
  }, [end, locked, show]);

  return { visible: locked && visible, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: end } };
}
