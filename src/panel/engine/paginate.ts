import type { PanelLayout, PanelPage, PanelWidget } from '../types';
import { sizeToSpan, strideScanSteps } from './grid';
import { createUuid } from '../../lib/uuid';

export interface PaginateCapacity {
  gridCols: number;
  pageRows: number;
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
  // Snap-to-stride rule: new widgets prefer (col, row) that are
  // multiples of `snapStride(span)`. A second stride-1 pass catches
  // off-stride holes so the widget lands in visible blank space
  // instead of spilling to another page.
  for (const step of strideScanSteps(cs, rs)) {
    for (let r = 0; r + rs <= rows; r += step.row) {
      for (let c = 0; c + cs <= cols; c += step.col) {
        const candidate = { col: c, row: r, colSpan: cs, rowSpan: rs };
        if (!rects.some(rect => rectsOverlap(rect, candidate))) {
          return { col: c, row: r };
        }
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
 * First free rect for a span, scanned in the grid's long-axis order.
 * `columnMajor` walks top-to-bottom within a column before moving right
 * (landscape flow); otherwise left-to-right within a row before moving
 * down (portrait flow). Stride 1 (every cell) for the tightest fit -
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
 * overlapping - that clip is pagination's problem, not packing's.
 */
export function repackToFit(
  widgets: readonly PanelWidget[],
  cols: number,
  rows: number,
  columnMajor = cols > rows,
): PanelWidget[] {
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

const fitsColumns = (w: PanelWidget, cols: number) => w.col + sizeToSpan(w.size).cols <= cols;

/**
 * Render-only: widgets past the right edge of `cols` show below the rest, from
 * the left, in reading order. One keeps its cell in `previous` while that cell
 * is free, so a drop beside it does not push it further down.
 */
export function overflowLayout(layout: PanelLayout, cols: number, previous?: PanelLayout | null): PanelLayout {
  const before = new Map(previous?.pages.flatMap(p => p.widgets.map(w => [w.id, w] as const)));
  let changed = false;
  const pages = layout.pages.map(page => {
    if (page.widgets.every(w => fitsColumns(w, cols))) return page;
    changed = true;
    const occupied = page.widgets.filter(w => fitsColumns(w, cols)).map(w => widgetRect(w, cols));
    const top = occupied.reduce((m, o) => Math.max(m, o.row + o.rowSpan), 0);
    const spilled = page.widgets
      .filter(w => !fitsColumns(w, cols))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    const shown = new Map<string, { col: number; row: number }>();
    const place = (w: PanelWidget, slot: { col: number; row: number }) => {
      occupied.push({ ...widgetRect(w, cols), ...slot });
      shown.set(w.id, slot);
    };
    for (const w of spilled) {
      const was = before.get(w.id);
      if (!was) continue;
      const rect = { ...widgetRect(w, cols), col: was.col, row: was.row };
      if (rect.col + rect.colSpan <= cols && !occupied.some(o => rectsOverlap(o, rect))) place(w, was);
    }
    // Blocks the rows above so first-fit starts at the bottom left.
    occupied.push({ col: 0, row: 0, colSpan: cols, rowSpan: top });
    // Stacking every spilled widget below everything is always a fit.
    const rows = spilled.reduce(
      (sum, w) => sum + widgetRect(w, cols).rowSpan,
      occupied.reduce((m, o) => Math.max(m, o.row + o.rowSpan), 0),
    );
    for (const w of spilled) {
      if (shown.has(w.id)) continue;
      const rect = widgetRect(w, cols);
      place(w, firstFitCell(occupied, cols, rows, rect.colSpan, rect.rowSpan, false)!);
    }
    return { ...page, widgets: page.widgets.map(w => {
      const slot = shown.get(w.id);
      return slot ? { ...w, col: slot.col, row: slot.row } : w;
    }) };
  });
  return changed ? { ...layout, pages } : layout;
}

/**
 * Maps a write made against `shown` (overflowLayout of `stored`) back for
 * storage: a moved-down widget the write left untouched keeps its stored cell
 * unless the write filled it.
 */
export function restoreOverflowPositions(next: PanelLayout, stored: PanelLayout, shown: PanelLayout): PanelLayout {
  const byId = (layout: PanelLayout) => new Map(layout.pages.flatMap(p => p.widgets.map(w => [w.id, w] as const)));
  const storedById = byId(stored);
  const shownById = byId(shown);
  const pages = next.pages.map(page => {
    const restore = new Map<string, PanelWidget>();
    for (const w of page.widgets) {
      const was = shownById.get(w.id);
      const home = storedById.get(w.id);
      if (!was || !home) continue;
      const displaced = was.col !== home.col || was.row !== home.row;
      const untouched = w.col === was.col && w.row === was.row && w.size === home.size;
      if (displaced && untouched) restore.set(w.id, home);
    }
    if (restore.size === 0) return page;
    const rect = (w: PanelWidget) => widgetRect(restore.get(w.id) ?? w, Number.POSITIVE_INFINITY);
    // A blocked widget stays where it was shown, which can block another.
    let blocked = true;
    while (blocked) {
      blocked = false;
      for (const id of [...restore.keys()]) {
        const home = rect(restore.get(id)!);
        if (page.widgets.some(o => o.id !== id && rectsOverlap(home, rect(o)))) {
          restore.delete(id);
          blocked = true;
        }
      }
    }
    return { ...page, widgets: page.widgets.map(w => {
      const home = restore.get(w.id);
      return home ? { ...w, col: home.col, row: home.row } : w;
    }) };
  });
  return { ...next, pages };
}

/** Rows down to the bottom edge of the lowest widget on any page. */
export function layoutRowExtent(layout: PanelLayout): number {
  let bottom = 0;
  for (const page of layout.pages) {
    for (const w of page.widgets) bottom = Math.max(bottom, w.row + Math.max(1, sizeToSpan(w.size).rows));
  }
  return bottom;
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
 * changes so consumers can `===`-check (PanelDevicePage's conform effect
 * would otherwise setLayout every render).
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
    // fixed point under re-clamp, which would loop the editor's conform
    // effect - so keep the clamped result there (clamp IS idempotent).
    // Pagination, not packing, owns real overflow.
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

function insideGrid(rect: WidgetRect, cols: number, rows: number): boolean {
  return rect.col >= 0 && rect.row >= 0 && rect.col + rect.colSpan <= cols && rect.row + rect.rowSpan <= rows;
}

// Places each widget on one page in order: it keeps its cell when that sits inside
// the grid clear of those already placed, else takes the first free rect.
function fillPage(widgets: readonly PanelWidget[], cols: number, rows: number): { placed: PanelWidget[]; overflow: PanelWidget[] } {
  const placed: PanelWidget[] = [];
  const overflow: PanelWidget[] = [];
  for (const w of widgets) {
    const rect = widgetRect(w, cols);
    if (insideGrid(rect, cols, rows) && !placed.some(o => rectsOverlap(widgetRect(o, cols), rect))) {
      placed.push(w);
      continue;
    }
    const slot = firstFreeRect(placed, cols, rows, rect.colSpan, rect.rowSpan);
    if (slot) placed.push({ ...w, col: slot.col, row: slot.row });
    else overflow.push(w);
  }
  return { placed, overflow };
}

/**
 * Fits every widget onto one page of the given grid (fillPage); what does not
 * fit is dropped. Returns the input when it already fits one page.
 */
export function fitLayoutToSinglePage(
  layout: PanelLayout,
  capacity: PaginateCapacity,
): { layout: PanelLayout; dropped: PanelWidget[] } {
  if (layout.pages.length === 0) return { layout, dropped: [] };
  const cols = Math.max(1, Math.floor(capacity.gridCols));
  const rows = Math.max(1, Math.floor(capacity.pageRows));
  const all = layout.pages.flatMap(p => p.widgets);
  if (layout.pages.length === 1 && pageFitsGrid(all, cols, rows)) return { layout, dropped: [] };
  const { placed, overflow } = fillPage(flattenPages(layout.pages), cols, rows);
  const first = layout.pages[0];
  return {
    layout: { ...layout, activePageId: first?.id, pages: [{ id: first?.id ?? '', widgets: placed }] },
    dropped: overflow,
  };
}

/**
 * Fits each page to the given grid (fillPage); what a page cannot hold opens a
 * new page right after it, and past maxPages is dropped. Returns the input when
 * every page already fits.
 */
export function fitLayoutToPages(
  layout: PanelLayout,
  capacity: PaginateCapacity,
  maxPages: number,
): { layout: PanelLayout; dropped: PanelWidget[] } {
  const cols = Math.max(1, Math.floor(capacity.gridCols));
  const rows = Math.max(1, Math.floor(capacity.pageRows));
  if (layout.pages.every(p => pageFitsGrid(p.widgets, cols, rows))) return { layout, dropped: [] };
  const pages: PanelPage[] = [];
  const dropped: PanelWidget[] = [];
  layout.pages.forEach((page, index) => {
    let id = page.id;
    // Immersive-on-load is honoured on the first page only, so its widget places first
    // there; widgets already inside the grid then keep their cells before the rest move.
    const mark = index === 0 ? layout.immersiveOnLoadWidgetId : undefined;
    const rank = (w: PanelWidget) => (w.id === mark ? 0 : insideGrid(widgetRect(w, cols), cols, rows) ? 1 : 2);
    let pending: readonly PanelWidget[] = flattenPages([page]).sort((a, b) => rank(a) - rank(b));
    for (;;) {
      const { placed, overflow } = fillPage(pending, cols, rows);
      // A stored page stays even when emptied: activePageId may name it.
      if (id === page.id) pages.push({ ...page, widgets: placed });
      else if (placed.length > 0) pages.push({ id, widgets: placed });
      if (overflow.length === 0) return;
      // Nothing placed means no empty page holds them; later stored pages keep their room.
      if (placed.length === 0 || pages.length + (layout.pages.length - index - 1) >= maxPages) {
        dropped.push(...overflow);
        return;
      }
      id = createUuid();
      pending = overflow;
    }
  });
  return { layout: { ...layout, pages }, dropped };
}
