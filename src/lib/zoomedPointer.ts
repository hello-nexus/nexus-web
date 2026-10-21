/**
 * Pointer position inside an element that sits under a CSS `zoom` ancestor.
 *
 * Engines disagree on the coordinate space of getBoundingClientRect there.
 * Standardized zoom keeps rects in the same viewport space as pointer
 * clientX/clientY. The older non-standard zoom reports rects divided by the
 * zoom while the pointer stays in viewport space, so (clientX - rect.left) /
 * rect.width lands at a position-dependent wrong spot. The panel scales its
 * immersive body with zoom, and a WebView2 runtime older than the
 * standardization ships the older behavior.
 */

/**
 * Factor by which the engine's rect is smaller than the viewport space the
 * pointer lives in: exactly 1 when rects are standard, exactly the zoom when
 * they are legacy. The rect-to-layout ratio only classifies which; it also
 * moves with ancestor transforms and rotation, which must not be mistaken for
 * zoom, so a computed zoom of 1 always means 1.
 */
export function rectZoomShortfall(rectWidth: number, layoutWidth: number, zoom: number): number {
  if (!(rectWidth > 0) || !(layoutWidth > 0) || !(zoom > 0) || Math.abs(zoom - 1) < 0.001) return 1;
  const ratio = rectWidth / layoutWidth;
  return Math.abs(ratio - zoom) <= Math.abs(ratio - 1) ? 1 : zoom;
}

/** Product of the computed `zoom` from the element up through its ancestors. */
export function effectiveZoom(el: Element): number {
  let z = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).zoom);
    if (Number.isFinite(v) && v > 0) z *= v;
  }
  return z;
}

/** Fractions (0..1 inside the element) of a viewport-space pointer position. */
export function pointerFraction(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  shortfall: number,
): { x: number; y: number } {
  return {
    x: (clientX / shortfall - rect.left) / rect.width,
    y: (clientY / shortfall - rect.top) / rect.height,
  };
}
