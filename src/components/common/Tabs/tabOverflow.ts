export interface OverflowEdges {
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export const SCROLL_STEP = 0.75;

// One pixel of slack absorbs sub-pixel scroll positions. Overflow is judged
// against the full host width, not the scroller (which the arrows shrink), so
// the arrows leave as soon as the tabs alone would fit.
export function computeEdges(scrollLeft: number, scrollWidth: number, clientWidth: number, hostWidth: number = clientWidth): OverflowEdges {
  const max = scrollWidth - clientWidth;
  return { overflow: scrollWidth - hostWidth > 1, atStart: scrollLeft <= 1, atEnd: scrollLeft >= max - 1 };
}

// New scrollLeft that brings a tab fully into view, or the current one when it already is.
export function revealOffset(scrollLeft: number, clientWidth: number, tabLeft: number, tabWidth: number): number {
  if (tabLeft < scrollLeft) return tabLeft;
  if (tabLeft + tabWidth > scrollLeft + clientWidth) return tabLeft + tabWidth - clientWidth;
  return scrollLeft;
}

export function scrollDelta(dir: 1 | -1, clientWidth: number): number {
  return dir * clientWidth * SCROLL_STEP;
}
