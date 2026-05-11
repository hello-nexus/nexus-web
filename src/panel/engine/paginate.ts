import type { PanelLayout, PanelPage, PanelWidget } from '../types';
import { sizeToSpan, snapStride } from './grid';

export interface PaginateCapacity {
  gridCols: number;
  pageRows: number;
}

/**
 * Returns the rows reserved by an enabled dock when the surface is
 * portrait. In landscape the dock takes a column instead, so this
 * returns 0 for the row axis and `paginateCapacityForGrid` shaves a
 * column from gridCols instead.
 */
export function dockRowsForGrid(
  gridColumns: number,
  gridRows: number,
  dockEnabled: boolean,
): number {
  if (!dockEnabled) return 0;
  void gridColumns; void gridRows;
  return 1;
}

/**
 * Builds the page capacity that layoutPage / placement helpers should
 * use for the current orientation. Portrait dock = -1 row; landscape
 * dock = -1 column.
 */
export function paginateCapacityForGrid(
  gridColumns: number,
  gridRows: number,
  dockEnabled: boolean,
  orientation: 'portrait' | 'landscape',
): PaginateCapacity {
  if (!dockEnabled) return { gridCols: gridColumns, pageRows: gridRows };
  if (orientation === 'landscape') {
    return { gridCols: Math.max(1, gridColumns - 1), pageRows: gridRows };
  }
  return { gridCols: gridColumns, pageRows: Math.max(1, gridRows - 1) };
}

/**
 * Returns true if widget `w`'s rect intersects the rect at (col, row)
 * with size (colSpan, rowSpan).
 */
export function rectsOverlap(
  a: { col: number; row: number; colSpan: number; rowSpan: number },
  b: { col: number; row: number; colSpan: number; rowSpan: number },
): boolean {
  return a.col < b.col + b.colSpan
    && b.col < a.col + a.colSpan
    && a.row < b.row + b.rowSpan
    && b.row < a.row + a.rowSpan;
}

interface WidgetRect { col: number; row: number; colSpan: number; rowSpan: number; }

function widgetRect(w: PanelWidget, cols: number): WidgetRect {
  const span = sizeToSpan(w.size);
  const colSpan = Math.max(1, Math.min(span.cols, cols));
  const rowSpan = Math.max(1, span.rows);
  return { col: w.col, row: w.row, colSpan, rowSpan };
}

/**
 * Returns the first row-major (col, row) where a widget of the given
 * span fits without overlapping any of `existing`. Returns null if no
 * fit is found within (cols, rows).
 */
export function firstFreeRect(
  existing: PanelWidget[],
  cols: number,
  rows: number,
  colSpan: number,
  rowSpan: number,
): { col: number; row: number } | null {
  const cs = Math.max(1, Math.min(colSpan, cols));
  const rs = Math.max(1, rowSpan);
  const rects = existing.map(w => widgetRect(w, cols));
  // Snap-to-stride rule: new widgets land on (col, row) that are
  // multiples of `snapStride(span)`. 1x1 walks every cell, every
  // larger size walks in 2-cell increments so 4x4 / 4x2 / 2x4 can
  // land off the full-span grid.
  const colStep = snapStride(cs);
  const rowStep = snapStride(rs);
  for (let r = 0; r + rs <= rows; r += rowStep) {
    for (let c = 0; c + cs <= cols; c += colStep) {
      const candidate = { col: c, row: r, colSpan: cs, rowSpan: rs };
      if (!rects.some(rect => rectsOverlap(rect, candidate))) {
        return { col: c, row: r };
      }
    }
  }
  return null;
}

/**
 * Clamps every widget's (col, row) so its rect stays in bounds for
 * the given capacity. Widgets whose clamped rect would still overlap
 * a sibling are left alone (the renderer clips on overflow). Returns
 * the same layout reference when nothing changes so consumers can
 * `===`-check.
 */
export function repaginatePanelLayout(layout: PanelLayout, capacity: PaginateCapacity): PanelLayout {
  const cols = Math.max(1, Math.floor(capacity.gridCols));
  const rows = Math.max(1, Math.floor(capacity.pageRows));
  let changed = false;
  const pages: PanelPage[] = layout.pages.map(page => {
    let pageChanged = false;
    const widgets = page.widgets.map(w => {
      const span = sizeToSpan(w.size);
      const colSpan = Math.max(1, Math.min(span.cols, cols));
      const rowSpan = Math.max(1, span.rows);
      const nextCol = Math.max(0, Math.min(w.col, cols - colSpan));
      const nextRow = Math.max(0, Math.min(w.row, Math.max(0, rows - rowSpan)));
      if (nextCol === w.col && nextRow === w.row) return w;
      pageChanged = true;
      return { ...w, col: nextCol, row: nextRow };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, widgets };
  });
  return changed ? { ...layout, pages } : layout;
}

/**
 * Walks every page's widgets in canonical (col, row) row-major order.
 * Used for keyboard nav, reads, and migration helpers. Storage order
 * is no longer canonical; (col, row) is.
 */
export function flattenPages(pages: PanelPage[]): PanelWidget[] {
  return pages.flatMap(page =>
    page.widgets.slice().sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    }),
  );
}
