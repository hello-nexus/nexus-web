import { useLayoutEffect, useState, type RefObject } from 'react';

/** Largest whole-px square key fitting cols x rows in the content box; null (keep 1fr) when unmeasured or too small. */
export function squareCellSize(
  width: number, height: number, cols: number, rows: number, colGap: number, rowGap: number,
): number | null {
  if (cols < 1 || rows < 1) return null;
  const cell = Math.floor(Math.min(
    (width - (cols - 1) * colGap) / cols,
    (height - (rows - 1) * rowGap) / rows,
  ));
  return cell > 0 ? cell : null;
}

/** Square key size for a deck grid filling its tile, from the grid's own padding and gaps; a layout effect so the first paint is square. */
export function useSquareCell(ref: RefObject<HTMLElement | null>, cols: number, rows: number, enabled = true): number | null {
  const [cell, setCell] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) { setCell(null); return; }
    const measure = () => {
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(v) || 0;
      const width = el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
      const height = el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
      setCell(squareCellSize(width, height, cols, rows, px(cs.columnGap), px(cs.rowGap)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, cols, rows, enabled]);
  return cell;
}
