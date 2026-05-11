import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// iOS-style swipe-to-dismiss for the bottom-anchored panel drawer (catalog,
// settings, panelSettings). Once the user starts a fresh gesture from
// scrollTop=0 inside the sheet, dragging downward translates the sheet itself
// instead of scrolling content; release crosses a threshold to either snap
// back to fully open or invoke the dismiss callback.

interface SwipeOptions {
  enabled: boolean;
  sheetRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  // Fraction of the sheet's measured offsetHeight at which a release dismisses
  // instead of snapping back.
  dismissDistanceFraction?: number;
  // Pixels per millisecond. A flick beyond this dismisses regardless of
  // distance traveled.
  dismissVelocity?: number;
}

export type SheetSwipeState = 'idle' | 'dragging' | 'settling';

interface SwipeResult {
  // 0 means at rest. Positive values pull the sheet downward.
  offset: number;
  state: SheetSwipeState;
}

const ENGAGE_DELTA = 6;
const SETTLE_MS = 240;

export function usePanelSheetSwipe({
  enabled,
  sheetRef,
  onDismiss,
  dismissDistanceFraction = 0.5,
  dismissVelocity = 0.6,
}: SwipeOptions): SwipeResult {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<SheetSwipeState>('idle');
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearSettle(), [clearSettle]);

  useEffect(() => {
    if (!enabled) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    let startY = 0;
    let startX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let isDragging = false;
    let startedAtTop = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Side-anchored sheets (landscape phone settings, wide-screen desktop)
      // shouldn't dismiss via downward swipe - the sheet enters horizontally,
      // so a vertical drag has nowhere to go. They're narrow and offset from
      // the left edge; full-width sheets (every bottom drawer, including
      // catalog/panelSettings with safe-area margins) span left-to-right.
      // Distinguish by full-width geometry alone - the bottom edge varies
      // with safe-area insets and isn't reliable.
      const rect = sheet.getBoundingClientRect();
      const fullWidthTolerance = 24;
      const fullWidth =
        rect.left <= fullWidthTolerance &&
        rect.right >= window.innerWidth - fullWidthTolerance;
      if (!fullWidth) {
        isDragging = false;
        startedAtTop = false;
        return;
      }
      const t = e.touches[0];
      if (isSheetSwipeControlTarget(t.target as Element | null, sheet)) {
        isDragging = false;
        startedAtTop = false;
        return;
      }

      startY = t.clientY;
      startX = t.clientX;
      lastY = t.clientY;
      lastTime = e.timeStamp;
      velocity = 0;
      isDragging = false;
      const scroller = findVerticalScroller(t.target as Element | null, sheet);
      startedAtTop = (scroller?.scrollTop ?? 0) <= 0;
      clearSettle();
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const deltaY = t.clientY - startY;
      const deltaX = t.clientX - startX;

      if (!isDragging) {
        if (deltaY <= ENGAGE_DELTA) return;
        if (Math.abs(deltaX) > deltaY) return;
        if (!startedAtTop) return;
        isDragging = true;
        setState('dragging');
      }

      if (isDragging) {
        if (e.cancelable) e.preventDefault();
        const dt = e.timeStamp - lastTime;
        if (dt > 0) velocity = (t.clientY - lastY) / dt;
        lastY = t.clientY;
        lastTime = e.timeStamp;
        setOffset(Math.max(0, deltaY - ENGAGE_DELTA));
      }
    };

    const onEnd = () => {
      if (!isDragging) {
        startedAtTop = false;
        return;
      }
      isDragging = false;
      const sheetHeight = sheet.offsetHeight || 1;
      const totalDelta = Math.max(0, lastY - startY - ENGAGE_DELTA);
      const dismissed =
        velocity > dismissVelocity ||
        totalDelta > sheetHeight * dismissDistanceFraction;

      setState('settling');
      clearSettle();
      if (dismissed) {
        // Glide off-screen via the CSS transition AND fire onDismiss right
        // away so the host's close path (widget dock-out, scrim fade) runs
        // in parallel rather than as a second animation after the sheet is
        // already gone. The host's unmount timer (EDITOR_EXIT_MS) is set to
        // match SETTLE_MS so the sheet finishes its glide before the tree
        // is removed.
        setOffset(sheetHeight + 32);
        onDismiss();
      } else {
        setOffset(0);
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          setState('idle');
        }, SETTLE_MS);
      }
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, sheetRef, onDismiss, dismissDistanceFraction, dismissVelocity, clearSettle]);

  return { offset, state };
}

function isSheetSwipeControlTarget(start: Element | null, until: HTMLElement): boolean {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== until) {
    if (node.matches('input[type="range"], [role="slider"], [data-panel-horizontal-control="true"]')) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

// Walks up from the touch target to the sheet root and returns the first
// ancestor that is itself a vertical scroller with content overflowing its
// viewport. Returns null when the user touched a non-scrolling region (e.g.
// the header) - in that case the gesture is treated as starting at scrollTop
// 0 and a downward drag dismisses immediately.
function findVerticalScroller(start: Element | null, until: HTMLElement): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== until) {
    const style = getComputedStyle(node);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll')
      && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
