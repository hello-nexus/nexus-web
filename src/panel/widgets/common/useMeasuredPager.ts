import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface MeasuredPager<T> {
  visible: T[];
  /** Page count; 1 when everything fits. */
  pages: number;
  page: number;
  /** False when everything fits - the caller renders no arrows at all. */
  paged: boolean;
  prev: () => void;
  next: () => void;
  /** The element the row must fit inside; its clientWidth is the budget. */
  stageRef: (node: HTMLDivElement | null) => void;
  /** The row that renders `visible`. Every child needs a `data-pager-key`. */
  rowRef: RefObject<HTMLDivElement | null>;
}

export interface MeasuredPagerOptions {
  /** Horizontal gap between items, in px (the hgap mixin's value). */
  gap: number;
  /** Width the arrows take off each side once the row pages. */
  arrowReserve: number;
}

/**
 * Pages a row of variable-width items by their measured width, so a page holds
 * as many as actually fit rather than a guessed count. Same overflow rule as
 * useFaderPager (page, never scroll or truncate) - that one is for fixed-width
 * cells, where a count is exact and no measurement is needed.
 *
 * How the measurement happens: until every item's width is known the hook
 * reports a single page holding everything, and the layout effect measures that
 * render. Because it is a layout effect the repack lands before the browser
 * paints, so the overflowing pass is never visible. Adding or renaming an item
 * puts it back into that state for one pass.
 *
 * Keys are joined with a newline to make one memo dependency; they come from
 * single-line text, so none can contain the separator.
 */
export function useMeasuredPager<T>(
  items: T[],
  keyOf: (item: T) => string,
  { gap, arrowReserve }: MeasuredPagerOptions,
): MeasuredPager<T> {
  // State, not a ref: the stage does not exist on the first commit (the list is
  // empty until its fetch resolves), and a ref would never re-run the observer
  // effect once it appeared.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});

  const signature = items.map(keyOf).join('\n');
  // True while a measure pass is due, which is also when every item is on
  // screen to be measured - so it is both the trigger and the precondition.
  const needsMeasure = splitKeys(signature).some(k => widths[k] === undefined);

  const starts = useMemo(() => {
    const keys = splitKeys(signature);
    if (keys.length === 0 || stageWidth === 0 || needsMeasure) return [0];
    const measured = keys.map(k => widths[k]);
    const packed = pack(measured, stageWidth, gap);
    // The arrows only exist once the row overflows, and they eat into it - so
    // an overflowing row is packed again against the narrower width.
    return packed.length > 1 ? pack(measured, stageWidth - arrowReserve * 2, gap) : packed;
  }, [signature, widths, stageWidth, needsMeasure, gap, arrowReserve]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!stage || !row) return;
    setStageWidth(prev => (prev === stage.clientWidth ? prev : stage.clientWidth));

    // Panel widgets render inside a transform: scale() wrapper, so a rect is in
    // scaled px while clientWidth, the gap and the arrow reserve are all layout
    // px. Divide the rects back so one budget compares against one space.
    const stageRect = stage.getBoundingClientRect().width;
    const scale = stage.clientWidth > 0 && stageRect > 0 ? stageRect / stage.clientWidth : 1;

    const live = new Set(splitKeys(signature));
    setWidths(prev => {
      const next = { ...prev };
      let changed = false;
      for (const node of Array.from(row.children)) {
        const key = node.getAttribute('data-pager-key');
        if (key === null) continue;
        // Sub-pixel, unlike offsetWidth: widths rounded down sum into a page
        // that claims to fit one more item than it really does.
        const width = node.getBoundingClientRect().width / scale;
        if (next[key] === width) continue;
        next[key] = width;
        changed = true;
      }
      for (const key of Object.keys(next)) {
        if (live.has(key)) continue;
        delete next[key];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [signature, needsMeasure, stage]);

  useLayoutEffect(() => {
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setStageWidth(prev => (prev === stage.clientWidth ? prev : stage.clientWidth));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // Every width measured before the webfont swapped in is wrong, and only the
  // items on screen at that moment would be re-measured - so the whole map goes
  // and the next pass, which renders everything, takes it again.
  useLayoutEffect(() => {
    let cancelled = false;
    void document.fonts?.ready?.then(() => { if (!cancelled) setWidths({}); });
    return () => { cancelled = true; };
  }, []);

  const pages = starts.length;
  // Clamped rather than reset: deleting an item on the last page should step
  // back a page, not throw the user to the front of the list.
  const current = Math.min(page, pages - 1);
  return {
    visible: items.slice(starts[current], starts[current + 1] ?? items.length),
    pages,
    page: current,
    paged: pages > 1,
    prev: () => setPage(p => Math.max(0, Math.min(p, pages - 1) - 1)),
    next: () => setPage(p => Math.min(pages - 1, p + 1)),
    stageRef: setStage,
    rowRef,
  };
}

function splitKeys(signature: string): string[] {
  return signature.length > 0 ? signature.split('\n') : [];
}

/** Greedy first-fit; an item wider than the whole row still gets its own page. */
function pack(widths: number[], available: number, gap: number): number[] {
  const starts = [0];
  let used = 0;
  let count = 0;
  for (let i = 0; i < widths.length; i++) {
    const add = count === 0 ? widths[i] : widths[i] + gap;
    if (count > 0 && used + add > available) {
      starts.push(i);
      used = widths[i];
      count = 1;
    } else {
      used += add;
      count++;
    }
  }
  return starts;
}
