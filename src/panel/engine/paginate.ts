import type { PanelLayout, PanelPage, PanelSurface, PanelWidget } from '../types';
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
 * dock = -1 column — UNLESS the surface ships a fixed grid with
 * vertical (portrait) or horizontal (landscape) slack the dock can
 * occupy without stealing a cell from the page. Y70 portrait is the
 * only such surface today: its 4x12 grid leaves enough vertical room
 * for a full dock row below, so a 12-row page stays 12 rows even with
 * the dock active.
 */
export function paginateCapacityForGrid(
  gridColumns: number,
  gridRows: number,
  dockEnabled: boolean,
  orientation: 'portrait' | 'landscape',
  surface?: PanelSurface,
): PaginateCapacity {
  if (!dockEnabled) return { gridCols: gridColumns, pageRows: gridRows };
  if (surface === 'y70' && orientation === 'portrait') {
    return { gridCols: gridColumns, pageRows: gridRows };
  }
  if (orientation === 'landscape') {
    return { gridCols: Math.max(1, gridColumns - 1), pageRows: gridRows };
  }
  return { gridCols: gridColumns, pageRows: Math.max(1, gridRows - 1) };
}

/** True if rects `a` and `b` intersect. */
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

/** True if any two widgets on the page overlap at the given column count. */
export function pageHasOverlap(widgets: readonly PanelWidget[], cols: number): boolean {
  const rects = widgets.map(w => widgetRect(w, cols));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return true;
    }
  }
  return false;
}

export function pagesHaveOverlap(pages: readonly PanelPage[], cols: number): boolean {
  return pages.some(page => pageHasOverlap(page.widgets, cols));
}

/** True if every widget sits inside the grid and none overlap. */
export function pageFitsGrid(widgets: readonly PanelWidget[], cols: number, rows: number): boolean {
  for (const w of widgets) {
    const rect = widgetRect(w, cols);
    if (rect.col < 0 || rect.row < 0) return false;
    if (rect.col + rect.colSpan > cols || rect.row + rect.rowSpan > rows) return false;
  }
  return !pageHasOverlap(widgets, cols);
}

/**
 * Row-major repack: lays widgets out left-to-right, top-to-bottom into
 * `cols` columns in array order, recovering a gap-free layout after a
 * size snap or an orientation clamp drops widgets on top of each other.
 */
export function repackPage(widgets: PanelWidget[], cols: number): PanelWidget[] {
  let cursorRow = 0;
  let cursorCol = 0;
  let currentRowMaxSpan = 0;
  return widgets.map(widget => {
    const span = sizeToSpan(widget.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    if (cursorCol + colSpan > cols) {
      cursorRow += currentRowMaxSpan || 1;
      cursorCol = 0;
      currentRowMaxSpan = 0;
    }
    const placed: PanelWidget = { ...widget, col: cursorCol, row: cursorRow };
    cursorCol += colSpan;
    if (rowSpan > currentRowMaxSpan) currentRowMaxSpan = rowSpan;
    return placed;
  });
}

/**
 * First free rect for a span, scanned in the grid's long-axis order.
 * `columnMajor` walks top-to-bottom within a column before moving right
 * (landscape flow); otherwise left-to-right within a row before moving
 * down (portrait flow). Stride 1 (every cell) for the tightest fit —
 * repacking prioritises no-clip over snap aesthetics. Null if nothing
 * fits inside (cols, rows).
 */
function firstFitCell(
  occupied: WidgetRect[],
  cols: number,
  rows: number,
  colSpan: number,
  rowSpan: number,
  columnMajor: boolean,
): { col: number; row: number } | null {
  const fits = (col: number, row: number) =>
    !occupied.some(o => rectsOverlap(o, { col, row, colSpan, rowSpan }));
  if (columnMajor) {
    for (let c = 0; c + colSpan <= cols; c++) {
      for (let r = 0; r + rowSpan <= rows; r++) {
        if (fits(c, r)) return { col: c, row: r };
      }
    }
  } else {
    for (let r = 0; r + rowSpan <= rows; r++) {
      for (let c = 0; c + colSpan <= cols; c++) {
        if (fits(c, r)) return { col: c, row: r };
      }
    }
  }
  return null;
}

/**
 * Repacks a page so every widget fits the (cols, rows) grid without
 * overlapping. Flow follows the grid's long axis: landscape (wider than
 * tall) fills top-to-bottom then rightward; portrait fills left-to-right
 * then downward. Widgets are sequenced by their pre-repack position in
 * that same order so the visual reading order survives a rotation, and
 * placed first-fit (so a big tile claims its block before small ones
 * fragment the grid). Output keeps the input array order so callers can
 * diff positions by index. Over-capacity pages (more widget area than
 * the grid holds) push the leftover past the flow edge without
 * overlapping — that clip is pagination's problem, not packing's.
 */
export function repackToFit(widgets: readonly PanelWidget[], cols: number, rows: number): PanelWidget[] {
  const columnMajor = cols > rows;
  const ordered = widgets
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const primaryA = columnMajor ? a.w.col : a.w.row;
      const primaryB = columnMajor ? b.w.col : b.w.row;
      if (primaryA !== primaryB) return primaryA - primaryB;
      const secondaryA = columnMajor ? a.w.row : a.w.col;
      const secondaryB = columnMajor ? b.w.row : b.w.col;
      if (secondaryA !== secondaryB) return secondaryA - secondaryB;
      return a.i - b.i;
    });
  const occupied: WidgetRect[] = [];
  const out = new Array<PanelWidget>(widgets.length);
  for (const { w, i } of ordered) {
    const span = sizeToSpan(w.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    let slot = firstFitCell(occupied, cols, rows, colSpan, rowSpan, columnMajor);
    if (!slot) {
      slot = columnMajor
        ? { col: occupied.reduce((m, o) => Math.max(m, o.col + o.colSpan), 0), row: 0 }
        : { col: 0, row: occupied.reduce((m, o) => Math.max(m, o.row + o.rowSpan), 0) };
    }
    occupied.push({ col: slot.col, row: slot.row, colSpan, rowSpan });
    out[i] = { ...w, col: slot.col, row: slot.row };
  }
  return out;
}

/**
 * Re-fits every widget to the given capacity. Each (col, row) is first
 * clamped so its rect stays in bounds; clamping toward the same edge can
 * collapse a stack onto one cell (portrait→landscape shrinks the row
 * axis, so widgets pinned past the new last row land on top of each
 * other). When a page still overlaps after clamping, it is repacked to
 * fit the current grid (`repackToFit`, long-axis flow) so nothing
 * overlaps or clips; a page that clamps cleanly keeps its positions and
 * any intentional gaps. Returns the same layout reference when nothing
 * changes so consumers can `===`-check (load-bearing: the persist effect
 * re-fires otherwise).
 */
export function repaginatePanelLayout(layout: PanelLayout, capacity: PaginateCapacity): PanelLayout {
  const cols = Math.max(1, Math.floor(capacity.gridCols));
  const rows = Math.max(1, Math.floor(capacity.pageRows));
  let changed = false;
  const pages: PanelPage[] = layout.pages.map(page => {
    const clamped = page.widgets.map(w => {
      const span = sizeToSpan(w.size);
      const colSpan = Math.max(1, Math.min(span.cols, cols));
      const rowSpan = Math.max(1, span.rows);
      const col = Math.max(0, Math.min(w.col, cols - colSpan));
      const row = Math.max(0, Math.min(w.row, Math.max(0, rows - rowSpan)));
      return { ...w, col, row };
    });
    // Repack from the original (pre-clamp) positions to keep reading order,
    // but only adopt it if it actually fits. An over-capacity page (more
    // widget area than the grid holds) can't be packed clean and isn't a
    // fixed point under re-clamp, which would loop the persist effect — so
    // keep the clamped result there (clamp IS idempotent). Pagination, not
    // packing, owns genuine overflow.
    let widgets = clamped;
    if (pageHasOverlap(clamped, cols)) {
      const repacked = repackToFit(page.widgets, cols, rows);
      if (pageFitsGrid(repacked, cols, rows)) widgets = repacked;
    }
    const pageChanged = widgets.some((w, i) =>
      w.col !== page.widgets[i].col || w.row !== page.widgets[i].row);
    if (!pageChanged) return page;
    changed = true;
    return { ...page, widgets };
  });
  return changed ? { ...layout, pages } : layout;
}

/**
 * Walks every page's widgets in canonical (col, row) row-major order.
 * (col, row) is canonical; storage order is not.
 */
export function flattenPages(pages: PanelPage[]): PanelWidget[] {
  return pages.flatMap(page =>
    page.widgets.slice().sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    }),
  );
}
