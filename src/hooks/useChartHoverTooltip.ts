import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

// Gap between the cursor and the tooltip's near edge, keeping the hovered
// column visible beside the tooltip.
const CURSOR_GAP = 22;

/**
 * Cursor-anchored positioning for a chart hover tooltip. The tooltip sits to
 * the right of the cursor, flips to the left when it would overflow the
 * wrapper, and is vertically centered on the cursor clamped to the wrapper -
 * so it never covers the hovered part of the chart.
 *
 * Positioning is imperative (direct style writes from the mousemove handler)
 * so the tooltip tracks the cursor without a React render per move; the
 * layout effect re-places it when its content re-renders.
 */
export function useChartHoverTooltip(wrapRef: RefObject<HTMLDivElement | null>, active: boolean) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

  const place = useCallback(() => {
    const tip = tooltipRef.current;
    const wrap = wrapRef.current;
    const cursor = cursorRef.current;
    if (!tip || !wrap || !cursor) return;
    let left = cursor.x + CURSOR_GAP;
    if (left + tip.offsetWidth > wrap.clientWidth) left = cursor.x - CURSOR_GAP - tip.offsetWidth;
    left = Math.max(0, Math.min(left, wrap.clientWidth - tip.offsetWidth));
    const top = Math.max(0, Math.min(cursor.y - tip.offsetHeight / 2, wrap.clientHeight - tip.offsetHeight));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, [wrapRef]);

  const trackCursor = useCallback((e: { clientX: number; clientY: number }) => {
    const wrap = wrapRef.current;
    if (!wrap || wrap.offsetWidth === 0) return;
    const rect = wrap.getBoundingClientRect();
    // Ancestor transforms (the panel's --panel-scale) scale the rect but not
    // client/offset sizes; divide back to layout px so the written left/top
    // land where the cursor visually is.
    const scale = rect.width / wrap.offsetWidth;
    cursorRef.current = {
      x: (e.clientX - rect.left) / scale - wrap.clientLeft,
      y: (e.clientY - rect.top) / scale - wrap.clientTop,
    };
    place();
  }, [wrapRef, place]);

  // No dep array: the tooltip's size changes with its content (live values,
  // row count), so it re-places after every render while visible.
  useLayoutEffect(() => {
    if (active) place();
  });

  return { tooltipRef, trackCursor };
}
