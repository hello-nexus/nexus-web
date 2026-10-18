import {
  isFreeformWidgetSize,
  type PanelWidgetSize,
} from '../types';
import { sizeToSpan, type GridSpan } from './grid';

// Spans are cols x rows, as in grid.ts.

export interface FreeformRect { col: number; row: number; cols: number; rows: number; }
export interface FreeformBounds { cols: number; rows: number; }
export type FreeformCorner = 'tl' | 'tr' | 'bl' | 'br';

const FREEFORM_MIN_SIDE = 4;

export function spanToSize(span: GridSpan): PanelWidgetSize {
  return `${span.cols}x${span.rows}`;
}

/** Declared sizes plus every span with both sides even and at least 4, capped by the grid; the round mask is not a span. */
export function freeformSnapSpans(
  declared: readonly PanelWidgetSize[],
  bounds: FreeformBounds,
): GridSpan[] {
  const spans = new Map<string, GridSpan>();
  const add = (span: GridSpan) => {
    if (span.cols > bounds.cols || span.rows > bounds.rows) return;
    spans.set(`${span.cols}x${span.rows}`, span);
  };
  for (const size of declared) {
    if (size !== '2x2round') add(sizeToSpan(size));
  }
  for (let cols = FREEFORM_MIN_SIDE; cols <= bounds.cols; cols += 2) {
    for (let rows = FREEFORM_MIN_SIDE; rows <= bounds.rows; rows += 2) add({ cols, rows });
  }
  return [...spans.values()];
}

function distance(a: GridSpan, cols: number, rows: number): number {
  return Math.hypot(a.cols - cols, a.rows - rows);
}

/** Drags one corner by (dCols, dRows) cells with the opposite corner fixed; picks the nearest snap span that fits the grid, smaller on a tie. */
export function resizeRectFromCorner(
  start: FreeformRect,
  corner: FreeformCorner,
  dCols: number,
  dRows: number,
  snapSpans: readonly GridSpan[],
  bounds: FreeformBounds,
): FreeformRect {
  const fromLeft = corner === 'tl' || corner === 'bl';
  const fromTop = corner === 'tl' || corner === 'tr';
  const right = start.col + start.cols;
  const bottom = start.row + start.rows;
  const rawCols = fromLeft ? start.cols - dCols : start.cols + dCols;
  const rawRows = fromTop ? start.rows - dRows : start.rows + dRows;

  let best: FreeformRect | null = null;
  let bestScore = Infinity;
  let bestArea = Infinity;
  for (const span of snapSpans) {
    const col = fromLeft ? right - span.cols : start.col;
    const row = fromTop ? bottom - span.rows : start.row;
    if (col < 0 || row < 0 || col + span.cols > bounds.cols || row + span.rows > bounds.rows) continue;
    const score = distance(span, rawCols, rawRows);
    const area = span.cols * span.rows;
    if (score < bestScore || (score === bestScore && area < bestArea)) {
      best = { col, row, cols: span.cols, rows: span.rows };
      bestScore = score;
      bestArea = area;
    }
  }
  return best ?? start;
}

/** Moves a rect by (dCols, dRows) cells, rounded to whole cells and kept inside the grid. */
export function moveRect(
  start: FreeformRect,
  dCols: number,
  dRows: number,
  bounds: FreeformBounds,
): FreeformRect {
  const col = Math.max(0, Math.min(Math.round(start.col + dCols), bounds.cols - start.cols));
  const row = Math.max(0, Math.min(Math.round(start.row + dRows), bounds.rows - start.rows));
  return { ...start, col, row };
}

export function sameRect(a: FreeformRect, b: FreeformRect): boolean {
  return a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;
}

/** Shrinks a freeform span to the grid so a layout saved on a larger panel still shows; other sizes pass through. */
export function clampFreeformSize(size: PanelWidgetSize, bounds: FreeformBounds): PanelWidgetSize {
  if (!isFreeformWidgetSize(size)) return size;
  const span = sizeToSpan(size);
  if (span.cols <= bounds.cols && span.rows <= bounds.rows) return size;
  return spanToSize({
    cols: Math.max(1, Math.min(span.cols, bounds.cols)),
    rows: Math.max(1, Math.min(span.rows, bounds.rows)),
  });
}
