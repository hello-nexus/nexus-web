import type { PanelDock, PanelLayout, PanelPage, PanelWidget } from '../types';
import { firstFreeRect, rectsOverlap, type PaginateCapacity } from './paginate';
import { sizeToSpan, snapStride } from './grid';
import { createUuid } from '../../lib/uuid';

interface WidgetRect { col: number; row: number; colSpan: number; rowSpan: number; }

function widgetRect(w: PanelWidget, cols: number): WidgetRect {
  const span = sizeToSpan(w.size);
  const colSpan = Math.max(1, Math.min(span.cols, cols));
  const rowSpan = Math.max(1, span.rows);
  return { col: w.col, row: w.row, colSpan, rowSpan };
}

/**
 * Appends `next` to the first page that has a free row-major rect
 * for it. If no existing page fits, a new empty page is created and
 * the widget lands at (0, 0) - unless `singlePage` is true, in which
 * case the layout is returned unchanged (the caller sees a no-op).
 * Position is set on the returned widget before insertion. Idempotent:
 * pages with stable ids stay stable.
 */
export function appendWidget(
  layout: PanelLayout,
  next: PanelWidget,
  capacity: PaginateCapacity,
  options?: { singlePage?: boolean },
): PanelLayout {
  const span = sizeToSpan(next.size);
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);
  const colSpan = Math.max(1, Math.min(span.cols, cols));
  const rowSpan = Math.max(1, span.rows);

  for (let i = 0; i < layout.pages.length; i++) {
    const slot = firstFreeRect(layout.pages[i].widgets, cols, rows, colSpan, rowSpan);
    if (slot) {
      const placed: PanelWidget = { ...next, col: slot.col, row: slot.row };
      const pages = layout.pages.map((page, idx) =>
        idx === i ? { ...page, widgets: [...page.widgets, placed] } : page);
      return { ...layout, pages };
    }
  }
  if (options?.singlePage) {
    // Dashboard mode: no implicit new-page creation. Caller can surface
    // a "panel full" affordance if it wants.
    return layout;
  }
  const newPage: PanelPage = {
    id: createUuid(),
    widgets: [{ ...next, col: 0, row: 0 }],
  };
  return { ...layout, pages: [...layout.pages, newPage] };
}

/**
 * Removes a widget by id. The cell stays empty: no later widget
 * shifts up to fill. If the removal empties a non-first page, the
 * page is dropped so the user does not end up paging through blank
 * pages.
 */
export function removeWidgetById(
  layout: PanelLayout,
  widgetId: string,
  _capacity: PaginateCapacity,
): PanelLayout {
  void _capacity;
  const dock = layout.dock
    ? { ...layout.dock, widgets: layout.dock.widgets.filter(w => w.id !== widgetId) }
    : layout.dock;
  let removed = false;
  const pagesAfter = layout.pages.map(page => {
    const next = page.widgets.filter(w => w.id !== widgetId);
    if (next.length === page.widgets.length) return page;
    removed = true;
    return { ...page, widgets: next };
  });
  if (!removed) {
    return layout.dock === dock ? layout : { ...layout, dock };
  }
  // Drop trailing empty pages but keep at least one. The first page
  // is always kept even when empty so the renderer always has a page
  // to show.
  const pruned: PanelPage[] = [];
  pagesAfter.forEach((page, idx) => {
    if (page.widgets.length === 0 && idx > 0) return;
    pruned.push(page);
  });
  return { ...layout, dock, pages: pruned.length === 0 ? [pagesAfter[0]] : pruned };
}

/**
 * Patches a widget by id (used for resize / config). When a size
 * change makes the new rect overlap siblings, this routes through
 * previewDrag so the overlapped siblings cascade row-major into the
 * next free aligned cells - exactly the same "make room" behaviour
 * that drag uses. The patch is only rejected when previewDrag can't
 * find a home for every displaced widget. Dock entries are updated
 * in place because they are not on the grid.
 */
export function patchWidgetById(
  layout: PanelLayout,
  widgetId: string,
  patch: (widget: PanelWidget) => PanelWidget,
  capacity: PaginateCapacity,
): PanelLayout {
  if (layout.dock?.widgets.some(w => w.id === widgetId)) {
    const dock: PanelDock = {
      ...layout.dock,
      widgets: layout.dock.widgets.map(w => w.id === widgetId ? patch(w) : w),
    };
    return { ...layout, dock };
  }
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);
  let pageIdx = -1;
  let current: PanelWidget | undefined;
  for (let i = 0; i < layout.pages.length; i++) {
    const w = layout.pages[i].widgets.find(w => w.id === widgetId);
    if (w) { current = w; pageIdx = i; break; }
  }
  if (!current) return layout;
  const patchResult = patch(current);
  if (patchResult === current) return layout;

  // Slide the widget left / up if the new rect would push past the
  // right or bottom edge. Build a NEW widget object instead of
  // mutating `patchResult` - the caller-supplied patch function may
  // have returned an object we don't own, and mutating it would be
  // a sharp edge for any caller that returns a frozen / shared ref.
  let nextRect = widgetRect(patchResult, cols);
  let patched = patchResult;
  if (nextRect.col + nextRect.colSpan > cols) {
    patched = { ...patched, col: Math.max(0, cols - nextRect.colSpan) };
    nextRect = widgetRect(patched, cols);
  }
  if (nextRect.row + nextRect.rowSpan > rows) {
    patched = { ...patched, row: Math.max(0, rows - nextRect.rowSpan) };
    nextRect = widgetRect(patched, cols);
  }

  // Drop in the patched widget so previewDrag sees the new size.
  const patchedLayout: PanelLayout = {
    ...layout,
    pages: layout.pages.map((page, i) =>
      i === pageIdx
        ? { ...page, widgets: page.widgets.map(w => w.id === widgetId ? patched : w) }
        : page),
  };

  // If the patch is config-only (no size or position change), no
  // cascade needed - return early.
  const sizeChanged = patched.size !== current.size;
  const positionChanged = patched.col !== current.col || patched.row !== current.row;
  if (!sizeChanged && !positionChanged) return patchedLayout;

  // Cascade overlapping siblings via previewDrag. The "drop" is at
  // the patched (col, row), so previewDrag uses the new size from
  // the layout for the placedRect calc and pushes any overlapped
  // siblings into free cells.
  const result = previewDrag(
    patchedLayout,
    widgetId,
    patchedLayout.pages[pageIdx].id,
    patched.col,
    patched.row,
    capacity,
  );
  if (!result) return patchedLayout;
  return result;
}

/**
 * Moves `sourceId` to the cell of `overId`. If overId is occupied,
 * the two widgets swap (source takes overId's cell, overId takes
 * source's cell). If they live on different pages, the swap moves
 * both widgets across pages.
 *
 * If the target cell is empty (overId references the dragged widget's
 * own placeholder ghost from dnd-kit), the move is a no-op.
 *
 * No-op when either id is missing.
 */
export function moveWidget(
  layout: PanelLayout,
  sourceId: string,
  overId: string,
  _capacity: PaginateCapacity,
): PanelLayout {
  void _capacity;
  if (sourceId === overId) return layout;
  let sourcePageIdx = -1;
  let overPageIdx = -1;
  let source: PanelWidget | undefined;
  let over: PanelWidget | undefined;
  for (let i = 0; i < layout.pages.length; i++) {
    for (const w of layout.pages[i].widgets) {
      if (w.id === sourceId) { source = w; sourcePageIdx = i; }
      if (w.id === overId) { over = w; overPageIdx = i; }
    }
  }
  if (!source || !over) return layout;

  // Swap (col, row); cross-page swap also moves the widgets across
  // pages so their containers reflect the new home.
  const swappedSource: PanelWidget = { ...source, col: over.col, row: over.row };
  const swappedOver: PanelWidget = { ...over, col: source.col, row: source.row };

  if (sourcePageIdx === overPageIdx) {
    const pageIdx = sourcePageIdx;
    const widgets = layout.pages[pageIdx].widgets.map(w => {
      if (w.id === sourceId) return swappedSource;
      if (w.id === overId) return swappedOver;
      return w;
    });
    const pages = layout.pages.map((page, idx) =>
      idx === pageIdx ? { ...page, widgets } : page);
    return { ...layout, pages };
  }

  const pages = layout.pages.map((page, idx) => {
    if (idx === sourcePageIdx) {
      // Remove source, add the swapped over.
      return {
        ...page,
        widgets: page.widgets.flatMap(w => {
          if (w.id === sourceId) return [];
          return [w];
        }).concat(swappedOver),
      };
    }
    if (idx === overPageIdx) {
      return {
        ...page,
        widgets: page.widgets.flatMap(w => {
          if (w.id === overId) return [];
          return [w];
        }).concat(swappedSource),
      };
    }
    return page;
  });
  return { ...layout, pages };
}

/**
 * Places `sourceId` on `targetPageId` with its top-left at
 * (col, row). If the resulting rect overlaps any sibling on that
 * page, returns the layout unchanged (drop refused). The widget is
 * removed from its current page if it lives elsewhere.
 */
export function placeWidgetAt(
  layout: PanelLayout,
  sourceId: string,
  targetPageId: string,
  col: number,
  row: number,
  capacity: PaginateCapacity,
): PanelLayout {
  let sourcePageIdx = -1;
  let source: PanelWidget | undefined;
  for (let i = 0; i < layout.pages.length; i++) {
    for (const w of layout.pages[i].widgets) {
      if (w.id === sourceId) { source = w; sourcePageIdx = i; break; }
    }
    if (source) break;
  }
  if (!source) return layout;

  const targetPageIdx = layout.pages.findIndex(p => p.id === targetPageId);
  if (targetPageIdx < 0) return layout;

  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);
  const placed: PanelWidget = { ...source, col, row };
  const placedRect = widgetRect(placed, cols);
  // Refuse if the rect would push past the grid edges.
  if (placedRect.col + placedRect.colSpan > cols) return layout;
  if (placedRect.row + placedRect.rowSpan > rows) return layout;

  const targetSiblings = layout.pages[targetPageIdx].widgets.filter(w => w.id !== sourceId);
  const collides = targetSiblings.some(other => rectsOverlap(placedRect, widgetRect(other, cols)));
  if (collides) return layout;

  // No-op if the source already sits at the requested cell on the
  // same page - prevents a redundant write that would burst the
  // 250 ms persistence debounce.
  if (sourcePageIdx === targetPageIdx && source.col === col && source.row === row) {
    return layout;
  }

  const pages = layout.pages.map((page, idx) => {
    if (idx === sourcePageIdx && idx === targetPageIdx) {
      return {
        ...page,
        widgets: page.widgets.map(w => w.id === sourceId ? placed : w),
      };
    }
    if (idx === sourcePageIdx) {
      return { ...page, widgets: page.widgets.filter(w => w.id !== sourceId) };
    }
    if (idx === targetPageIdx) {
      return { ...page, widgets: [...page.widgets, placed] };
    }
    return page;
  });
  return { ...layout, pages };
}

/**
 * iOS-Springboard-style "make room" preview. Returns what the layout
 * SHOULD look like if the user drops `sourceId` with its top-left at
 * (col, row) on `targetPageId`. Returns null if the drop is invalid:
 *
 *   - Active widget's rect would go off-grid.
 *   - Active is 1x1 and the target rect overlaps a non-1x1 widget
 *     (per iOS rule: a single icon cannot displace a larger widget).
 *   - One of the displaced widgets has no row-major free spot.
 *
 * Otherwise: non-overlapping widgets stay where they are; overlapping
 * widgets cascade row-major into the first empty rect that fits each
 * (skipping the active rect and earlier-displaced widgets).
 */
export function previewDrag(
  layout: PanelLayout,
  sourceId: string,
  targetPageId: string,
  col: number,
  row: number,
  capacity: PaginateCapacity,
): PanelLayout | null {
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);

  let sourcePageIdx = -1;
  let source: PanelWidget | undefined;
  for (let i = 0; i < layout.pages.length; i++) {
    const found = layout.pages[i].widgets.find(w => w.id === sourceId);
    if (found) { source = found; sourcePageIdx = i; break; }
  }
  if (!source) return null;

  const targetPageIdx = layout.pages.findIndex(p => p.id === targetPageId);
  if (targetPageIdx < 0) return null;

  const placed: PanelWidget = { ...source, col, row };
  const placedRect = widgetRect(placed, cols);

  // Short-circuit a no-op drop: same cell on the same page AND no
  // overlap with siblings. The overlap check matters because resize
  // calls previewDrag with the unchanged (col, row) but a larger
  // size - the rect can grow into siblings even when position stays
  // put, and we MUST cascade in that case (not short-circuit).
  if (sourcePageIdx === targetPageIdx && source.col === col && source.row === row) {
    const conflict = layout.pages[sourcePageIdx].widgets.some(w =>
      w.id !== sourceId && rectsOverlap(placedRect, widgetRect(w, cols)));
    if (!conflict) return layout;
  }
  if (placedRect.col < 0 || placedRect.row < 0) return null;
  if (placedRect.col + placedRect.colSpan > cols) return null;
  if (placedRect.row + placedRect.rowSpan > rows) return null;

  const targetSiblings = layout.pages[targetPageIdx].widgets.filter(w => w.id !== sourceId);
  const overlapping: PanelWidget[] = [];
  const stationary: PanelWidget[] = [];
  for (const w of targetSiblings) {
    if (rectsOverlap(placedRect, widgetRect(w, cols))) overlapping.push(w);
    else stationary.push(w);
  }

  // iOS rule: a single 1x1 icon can only push other 1x1 icons. If a
  // larger widget sits in the drop rect, the drop is refused.
  if (placed.size === '1x1' && overlapping.some(w => w.size !== '1x1')) {
    return null;
  }

  const occupied: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const mark = (rect: WidgetRect) => {
    for (let r = rect.row; r < rect.row + rect.rowSpan; r++) {
      for (let c = rect.col; c < rect.col + rect.colSpan; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) occupied[r][c] = true;
      }
    }
  };
  for (const w of stationary) mark(widgetRect(w, cols));
  mark(placedRect);

  // Walk displaced widgets in row-major order so the visual outcome
  // is deterministic regardless of how dnd-kit ordered them.
  const sorted = overlapping.slice().sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col,
  );

  const displaced: PanelWidget[] = [];
  for (const w of sorted) {
    const span = sizeToSpan(w.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    // Snap-to-stride rule: 1x1 walks every cell, every larger size
    // walks in 2-cell increments. Mirrors the active widget's snap
    // grid so cascaded widgets land on the same fine-grained slots.
    const colStep = snapStride(colSpan);
    const rowStep = snapStride(rowSpan);
    let found: { col: number; row: number } | null = null;
    for (let r = 0; r + rowSpan <= rows && !found; r += rowStep) {
      for (let c = 0; c + colSpan <= cols && !found; c += colStep) {
        let fits = true;
        for (let rr = r; rr < r + rowSpan && fits; rr++) {
          for (let cc = c; cc < c + colSpan && fits; cc++) {
            if (occupied[rr][cc]) fits = false;
          }
        }
        if (fits) found = { col: c, row: r };
      }
    }
    if (!found) return null;
    mark({ col: found.col, row: found.row, colSpan, rowSpan });
    displaced.push({ ...w, col: found.col, row: found.row });
  }

  const newTargetWidgets = [...stationary, placed, ...displaced];
  const pages = layout.pages.map((page, idx) => {
    if (idx === sourcePageIdx && idx === targetPageIdx) {
      return { ...page, widgets: newTargetWidgets };
    }
    if (idx === sourcePageIdx) {
      return { ...page, widgets: page.widgets.filter(w => w.id !== sourceId) };
    }
    if (idx === targetPageIdx) {
      return { ...page, widgets: newTargetWidgets };
    }
    return page;
  });
  return { ...layout, pages };
}

/**
 * Returns every (col, row) on `page` walked row-major. Used by the
 * engine to render drop targets during drag - we render droppables
 * at EVERY cell, including those covered by widgets, so the
 * collision detector can resolve a snap to any cell (including the
 * active widget's own home, which is needed for "drop where you
 * started = no-op").
 */
export function allCellsForPage(
  page: PanelPage,
  capacity: PaginateCapacity,
): { col: number; row: number }[] {
  void page;
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);
  const cells: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r });
    }
  }
  return cells;
}

/**
 * Toggles the dock and clamps existing widgets to the new capacity.
 */
export function setDockEnabled(
  layout: PanelLayout,
  enabled: boolean,
  _capacity: PaginateCapacity,
): PanelLayout {
  void _capacity;
  const dock: PanelDock = layout.dock
    ? { ...layout.dock, enabled }
    : { enabled, widgets: [] };
  return { ...layout, dock };
}
