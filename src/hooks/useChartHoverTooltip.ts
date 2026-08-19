import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

// Gap between the anchor and the tooltip's near edge, keeping the hovered
// column visible beside the tooltip.
const CURSOR_GAP = 22;

// Top inset the tooltip pins to in 'top' mode, so it stays put at the top of
// the chart instead of tracking the cursor's vertical position.
const TOP_MARGIN = 8;

export interface ChartHoverTooltipOptions {
  // 'top' pins the tooltip to the top of the chart (the monitoring-chart
  // behaviour); 'follow' vertically centers it on the anchor - pair with
  // trackPoint to glue the box to a specific element (the curve editor's
  // hovered handle).
  anchor?: 'top' | 'follow';
}

/**
 * Anchor-based positioning for a chart hover tooltip. The tooltip sits beside
 * the anchor horizontally (to its right, flipping left when it would overflow
 * the wrapper); vertically it either pins to the top of the chart ('top') or
 * centers on the anchor ('follow').
 *
 * Feed the anchor with trackCursor (pointer events, converted to layout px)
 * or trackPoint (already-layout-px coordinates, e.g. an SVG element's
 * position). Positioning is imperative (direct style writes) so the tooltip
 * tracks without a React render per move; the layout effect re-places it when
 * its content re-renders.
 */
export function useChartHoverTooltip(
  wrapRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  { anchor = 'top' }: ChartHoverTooltipOptions = {},
) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

  const place = useCallback(() => {
    const tip = tooltipRef.current;
    const wrap = wrapRef.current;
    const point = anchorRef.current;
    if (!tip || !wrap || !point) return;
    let left = point.x + CURSOR_GAP;
    if (left + tip.offsetWidth > wrap.clientWidth) left = point.x - CURSOR_GAP - tip.offsetWidth;
    left = Math.max(0, Math.min(left, wrap.clientWidth - tip.offsetWidth));
    const rawTop = anchor === 'follow' ? point.y - tip.offsetHeight / 2 : TOP_MARGIN;
    const top = Math.max(0, Math.min(rawTop, wrap.clientHeight - tip.offsetHeight));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, [wrapRef, anchor]);

  // Anchor in wrapper layout px, no conversion - for element-tied anchors the
  // caller already knows the coordinates.
  const trackPoint = useCallback((x: number, y: number) => {
    anchorRef.current = { x, y };
    place();
  }, [place]);

  const trackCursor = useCallback((e: { clientX: number; clientY: number }) => {
    const wrap = wrapRef.current;
    if (!wrap || wrap.offsetWidth === 0) return;
    const rect = wrap.getBoundingClientRect();
    // Ancestor transforms (the panel's --panel-scale) scale the rect but not
    // client/offset sizes; divide back to layout px so the written left/top
    // land where the cursor visually is.
    const scale = rect.width / wrap.offsetWidth;
    trackPoint(
      (e.clientX - rect.left) / scale - wrap.clientLeft,
      (e.clientY - rect.top) / scale - wrap.clientTop,
    );
  }, [wrapRef, trackPoint]);

  // No dep array: the tooltip's size changes with its content (live values,
  // row count), so it re-places after every render while visible.
  useLayoutEffect(() => {
    if (active) place();
  });

  return { tooltipRef, trackCursor, trackPoint };
}
