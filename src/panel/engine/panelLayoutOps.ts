import type { PanelLayout, PanelPage, PanelWidget, PanelWidgetSize } from '../types';
import { firstFreeRect, rectsOverlap, type PaginateCapacity } from './paginate';
import { sizeToSpan, strideScanSteps } from './grid';
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
 * for it - `preferredPageId` (the page the user is looking at) is
 * scanned first, then the rest in order. If no existing page fits, a
 * new empty page is created and the widget lands at (0, 0) - unless
 * `singlePage` is true, in which case the layout is returned unchanged
 * (the caller sees a no-op). Position is set on the returned widget
 * before insertion. Idempotent: pages with stable ids stay stable.
 */
export function appendWidget(
  layout: PanelLayout,
  next: PanelWidget,
  capacity: PaginateCapacity,
  options?: { singlePage?: boolean; preferredPageId?: string },
): PanelLayout {
  const span = sizeToSpan(next.size);
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);
  const colSpan = Math.max(1, Math.min(span.cols, cols));
  const rowSpan = Math.max(1, span.rows);

  const scanOrder = layout.pages.map((_, i) => i);
  const preferredIdx = options?.preferredPageId
    ? layout.pages.findIndex(p => p.id === options.preferredPageId)
    : -1;
  if (preferredIdx > 0) {
    scanOrder.splice(preferredIdx, 1);
    scanOrder.unshift(preferredIdx);
  }
  for (const i of scanOrder) {
    const slot = firstFreeRect(layout.pages[i].widgets, cols, rows, colSpan, rowSpan);
    if (slot) {
      const placed: PanelWidget = { ...next, col: slot.col, row: slot.row };
      const pages = layout.pages.map((page, idx) =>
        idx === i ? { ...page, widgets: [...page.widgets, placed] } : page);
      return { ...layout, pages };
    }
  }
  if (options?.singlePage) {
    // Dashboard mode: no implicit new-page creation.
    return layout;
  }
  const newPage: PanelPage = {
    id: createUuid(),
    widgets: [{ ...next, col: 0, row: 0 }],
  };
  return { ...layout, pages: [...layout.pages, newPage] };
}

/**
 * True when `appendWidget` would place a widget of `size` under the same
 * options. Runs the real placement rather than re-deriving them, so the
 * predicate cannot drift from what the add actually does. Only `singlePage`
 * (the dashboard) can refuse - other surfaces absorb the widget on a new page.
 */
export function canAppendWidget(
  layout: PanelLayout,
  size: PanelWidgetSize,
  capacity: PaginateCapacity,
  options?: { singlePage?: boolean; preferredPageId?: string },
): boolean {
  const probe: PanelWidget = { id: 'fit-probe', type: 'fit-probe', size, col: 0, row: 0 };
  return appendWidget(layout, probe, capacity, options) !== layout;
}

/**
 * Single-widget surface helper (Q-series): replaces every page-widget
 * with one fresh widget at (0, 0). The page list collapses to one page.
 */
export function replaceWidget(
  layout: PanelLayout,
  next: PanelWidget,
): PanelLayout {
  const placed: PanelWidget = { ...next, col: 0, row: 0 };
  const firstPageId = layout.pages[0]?.id ?? createUuid();
  return {
    ...layout,
    pages: [{ id: firstPageId, widgets: [placed] }],
  };
}

/**
 * Single-widget surface swap that preserves each widget type's config across
 * swaps: stashes the outgoing widget's config into `singleWidgetConfigs` (keyed
 * by type) and restores the incoming type's remembered config onto `next`, then
 * replaces the shown widget. `next.config` is ignored - the remembered config
 * for `next.type` wins (empty for a type shown for the first time).
 */
export function swapSingleWidget(
  layout: PanelLayout,
  next: PanelWidget,
): PanelLayout {
  const current = layout.pages[0]?.widgets[0];
  const remembered = layout.singleWidgetConfigs ?? {};
  const nextRemembered = current
    ? { ...remembered, [current.type]: current.config ?? {} }
    : remembered;
  // Copy the restored config so the active widget and the remembered snapshot
  // never alias; undefined stays undefined so a first-shown type gets defaults.
  const restoredConfig = nextRemembered[next.type];
  const restored: PanelWidget = {
    ...next,
    config: restoredConfig ? { ...restoredConfig } : undefined,
  };
  return { ...replaceWidget(layout, restored), singleWidgetConfigs: nextRemembered };
}

/**
 * Drops every empty page; when ALL pages are empty the first is kept so
 * the renderer always has a page to show. Repoints activePageId at the
 * nearest surviving page when its page was dropped, so id-based
 * consumers (the desktop preview arrows) resolve the same page the
 * on-device pager lands on via its index clamp, min(oldIndex,
 * lastIndex). Used after remove AND after a drop: dragging the last
 * widget off a page must not leave a blank page to swipe through.
 */
export function pruneEmptyPages(layout: PanelLayout): PanelLayout {
  const nonEmpty = layout.pages.filter(page => page.widgets.length > 0);
  const pages = nonEmpty.length > 0 ? nonEmpty : layout.pages.slice(0, 1);
  if (pages.length === layout.pages.length) return layout;
  let activePageId = layout.activePageId;
  if (activePageId && !pages.some(p => p.id === activePageId)) {
    const prevIdx = layout.pages.findIndex(p => p.id === activePageId);
    activePageId = pages[Math.min(Math.max(prevIdx, 0), pages.length - 1)]?.id;
  }
  return { ...layout, pages, activePageId };
}

/**
 * Removes a widget by id. The cell stays empty: no later widget
 * shifts up to fill. Pages the removal empties are pruned so the user
 * does not end up paging through blank pages.
 */
export function removeWidgetById(
  layout: PanelLayout,
  widgetId: string,
  _capacity: PaginateCapacity,
): PanelLayout {
  void _capacity;
  let removed = false;
  const pagesAfter = layout.pages.map(page => {
    const next = page.widgets.filter(w => w.id !== widgetId);
    if (next.length === page.widgets.length) return page;
    removed = true;
    return { ...page, widgets: next };
  });
  if (!removed) return layout;
  return pruneEmptyPages({ ...layout, pages: pagesAfter });
}

/**
 * Patches a widget by id (resize / config). When a size change makes
 * the new rect overlap siblings, this routes through previewDrag so
 * the overlapped siblings cascade row-major into free aligned cells.
 * When previewDrag can't home every displaced widget the patch is
 * rejected: the ORIGINAL layout comes back, never one with overlaps.
 */
export function patchWidgetById(
  layout: PanelLayout,
  widgetId: string,
  patch: (widget: PanelWidget) => PanelWidget,
  capacity: PaginateCapacity,
): PanelLayout {
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
  // right or bottom edge. Build a new widget object rather than mutate
  // `patchResult`: the patch function may return a frozen/shared ref.
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
  // A failed cascade means the patched rect overlaps siblings that have
  // nowhere to go. Reject the whole patch - patchedLayout would commit
  // overlapping widgets, which locks out subsequent edits.
  if (!result) return layout;
  return result;
}

/**
 * iOS-Springboard-style "make room" preview. Returns what the layout
 * SHOULD look like if the user drops `sourceId` with its top-left at
 * (col, row) on `targetPageId`. Returns null if the drop is invalid:
 *
 *   - Active widget's rect would go off-grid.
 *   - Active is 1x1 and the target rect overlaps a non-1x1 widget
 *     (per iOS rule: a single icon cannot displace a larger widget).
 *   - The page cannot hold the result even after a shift (below).
 *
 * Otherwise: non-overlapping widgets stay where they are; overlapping
 * widgets cascade row-major into the first empty rect that fits each
 * (skipping the active rect and earlier-displaced widgets). A Springboard
 * shift of the run between the source's old slot and the drop
 * (shiftPreview) replaces the cascade when the cascade fails, or when the
 * shift also lands the source on (col, row) and moves the siblings no
 * further - on a full column the cascade either fails or teleports a
 * neighbour into the vacated cell at the far end.
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
    // Stride-aligned slots first (mirrors the active widget's snap
    // grid), then a stride-1 pass so a displaced widget still homes
    // into off-stride free space instead of refusing the whole drop.
    let found: { col: number; row: number } | null = null;
    for (const step of strideScanSteps(colSpan, rowSpan)) {
      for (let r = 0; r + rowSpan <= rows && !found; r += step.row) {
        for (let c = 0; c + colSpan <= cols && !found; c += step.col) {
          let fits = true;
          for (let rr = r; rr < r + rowSpan && fits; rr++) {
            for (let cc = c; cc < c + colSpan && fits; cc++) {
              if (occupied[rr][cc]) fits = false;
            }
          }
          if (fits) found = { col: c, row: r };
        }
      }
      if (found) break;
    }
    if (!found) { displaced.length = 0; break; }
    mark({ col: found.col, row: found.row, colSpan, rowSpan });
    displaced.push({ ...w, col: found.col, row: found.row });
  }
  const cascaded = displaced.length === sorted.length
    ? withTargetPage(layout, sourceId, sourcePageIdx, targetPageIdx, [...stationary, placed, ...displaced])
    : null;
  if (overlapping.length === 0) return cascaded;

  const shifted = shiftPreview(layout, sourceId, sourcePageIdx, targetPageIdx, placed, cols, rows);
  if (!cascaded) return shifted;
  if (!shifted) return cascaded;
  const landed = shifted.pages[targetPageIdx].widgets.find(w => w.id === sourceId);
  if (!landed || landed.col !== col || landed.row !== row) return cascaded;
  // Ties go to the shift: it keeps the siblings' reading order, where the
  // cascade may leapfrog one past another into the vacated cell.
  return siblingTravel(layout, shifted, sourceId) <= siblingTravel(layout, cascaded, sourceId) ? shifted : cascaded;
}

function withTargetPage(
  layout: PanelLayout,
  sourceId: string,
  sourcePageIdx: number,
  targetPageIdx: number,
  targetWidgets: PanelWidget[],
): PanelLayout {
  const pages = layout.pages.map((page, idx) => {
    if (idx === targetPageIdx) return { ...page, widgets: targetWidgets };
    if (idx === sourcePageIdx) return { ...page, widgets: page.widgets.filter(w => w.id !== sourceId) };
    return page;
  });
  return { ...layout, pages };
}

// Manhattan distance every sibling moved between two layouts, the source excluded.
function siblingTravel(before: PanelLayout, after: PanelLayout, sourceId: string): number {
  const was = new Map(before.pages.flatMap(p => p.widgets).map(w => [w.id, w]));
  let total = 0;
  for (const w of after.pages.flatMap(p => p.widgets)) {
    if (w.id === sourceId) continue;
    const prev = was.get(w.id);
    if (prev) total += Math.abs(w.col - prev.col) + Math.abs(w.row - prev.row);
  }
  return total;
}

// Reading-order key: row first, then column.
function readingOrder(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return a.row !== b.row ? a.row - b.row : a.col - b.col;
}

function rectCentre(w: PanelWidget, cols: number): { col: number; row: number } {
  const rect = widgetRect(w, cols);
  return { col: rect.col + rect.colSpan / 2, row: rect.row + rect.rowSpan / 2 };
}

/**
 * The Springboard shift. The target page is read row-major with the
 * source inserted before the first sibling whose centre the drop has
 * reached; the run from its old slot to that insertion re-flows first-fit
 * inside its own row band, everything outside the band keeps its cells.
 * Null when no sibling is crossed or the band cannot hold the run.
 */
function shiftPreview(
  layout: PanelLayout,
  sourceId: string,
  sourcePageIdx: number,
  targetPageIdx: number,
  placed: PanelWidget,
  cols: number,
  rows: number,
): PanelLayout | null {
  const page = layout.pages[targetPageIdx];
  const others = page.widgets.filter(w => w.id !== sourceId).slice().sort(readingOrder);
  // Probe = drop top-left + half the SMALLER span, so a 4x4 dropped over a
  // 4x2 takes its place once their tops meet, and a 4x2 dropped on the last
  // row of a 4x4 lands below it.
  const placedSpan = sizeToSpan(placed.size);
  const insertAt = (() => {
    const idx = others.findIndex(w => {
      const span = sizeToSpan(w.size);
      const probe = {
        col: placed.col + Math.min(span.cols, placedSpan.cols) / 2,
        row: placed.row + Math.min(span.rows, placedSpan.rows) / 2,
      };
      return readingOrder(rectCentre(w, cols), probe) >= 0;
    });
    return idx < 0 ? others.length : idx;
  })();
  const source = sourcePageIdx === targetPageIdx ? page.widgets.find(w => w.id === sourceId) : undefined;
  // Same page: the run spans the old slot and the insertion. Cross-page:
  // everything from the insertion down shifts, into the free rows below.
  const oldAt = source
    ? (() => { const idx = others.findIndex(w => readingOrder(w, source) > 0); return idx < 0 ? others.length : idx; })()
    : others.length;
  const runStart = Math.min(oldAt, insertAt);
  const runEnd = Math.max(oldAt, insertAt);
  const runOthers = others.slice(runStart, runEnd);
  if (runOthers.length === 0) return null;
  // iOS rule, as for the cascade: a 1x1 shifts only other 1x1s.
  if (placed.size === '1x1' && runOthers.some(w => w.size !== '1x1')) return null;
  const run = [...others.slice(runStart, insertAt), placed, ...others.slice(insertAt, runEnd)];
  const stationary = [...others.slice(0, runStart), ...others.slice(runEnd)];

  const bandRects = [...runOthers, ...(source ? [source] : [placed])].map(w => widgetRect(w, cols));
  const bandTop = Math.min(...bandRects.map(r => r.row));
  const bandBottom = source ? Math.max(...bandRects.map(r => r.row + r.rowSpan)) : rows;

  const occupied: boolean[][] = Array.from({ length: rows }, (_, r) =>
    Array<boolean>(cols).fill(r < bandTop || r >= bandBottom));
  const mark = (rect: WidgetRect) => {
    for (let r = rect.row; r < rect.row + rect.rowSpan; r++) {
      for (let c = rect.col; c < rect.col + rect.colSpan; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) occupied[r][c] = true;
      }
    }
  };
  for (const w of stationary) mark(widgetRect(w, cols));

  const reflowed: PanelWidget[] = [];
  for (const w of run) {
    const span = sizeToSpan(w.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    let found: { col: number; row: number } | null = null;
    for (const step of strideScanSteps(colSpan, rowSpan)) {
      for (let r = 0; r + rowSpan <= rows && !found; r += step.row) {
        for (let c = 0; c + colSpan <= cols && !found; c += step.col) {
          let fits = true;
          for (let rr = r; rr < r + rowSpan && fits; rr++) {
            for (let cc = c; cc < c + colSpan && fits; cc++) {
              if (occupied[rr][cc]) fits = false;
            }
          }
          if (fits) found = { col: c, row: r };
        }
      }
      if (found) break;
    }
    if (!found) return null;
    mark({ col: found.col, row: found.row, colSpan, rowSpan });
    reflowed.push({ ...w, col: found.col, row: found.row });
  }
  const unchanged = reflowed.every(w => {
    const stored = page.widgets.find(x => x.id === w.id);
    return stored !== undefined && stored.col === w.col && stored.row === w.row;
  });
  if (unchanged) return null;

  return withTargetPage(layout, sourceId, sourcePageIdx, targetPageIdx, [...stationary, ...reflowed]);
}

/**
 * Resize a widget to `newSize`, pushing overlapped siblings out of the
 * way (cascading across pages, creating new pages up to `maxPages` if
 * needed). Returns the new layout on success, or `null` when the
 * displaced widgets have nowhere to go. Callers treat `null` as a hard
 * rejection: do NOT mutate state, surface feedback to the user.
 *
 * Cascade order: source page first (so a shrink stays put), then later
 * pages in order, then earlier pages, then a new trailing page.
 */
export function tryResizeWidget(
  layout: PanelLayout,
  widgetId: string,
  newSize: PanelWidgetSize,
  capacity: PaginateCapacity,
  maxPages: number,
): PanelLayout | null {
  const cols = Math.max(1, capacity.gridCols);
  const rows = Math.max(1, capacity.pageRows);

  let sourcePageIdx = -1;
  let source: PanelWidget | undefined;
  for (let i = 0; i < layout.pages.length; i++) {
    const found = layout.pages[i].widgets.find(w => w.id === widgetId);
    if (found) { source = found; sourcePageIdx = i; break; }
  }
  if (!source) return layout;
  if (source.size === newSize) return layout;

  const newSpan = sizeToSpan(newSize);
  const newColSpan = Math.max(1, Math.min(newSpan.cols, cols));
  const newRowSpan = Math.max(1, newSpan.rows);
  // Hard refusal: the size itself doesn't fit on any page.
  if (newRowSpan > rows) return null;
  // Slide left / up so the resized rect stays in bounds.
  const placedCol = Math.max(0, Math.min(source.col, cols - newColSpan));
  const placedRow = Math.max(0, Math.min(source.row, rows - newRowSpan));
  const placed: PanelWidget = { ...source, size: newSize, col: placedCol, row: placedRow };
  const placedRect: WidgetRect = { col: placedCol, row: placedRow, colSpan: newColSpan, rowSpan: newRowSpan };

  const sourceSiblings = layout.pages[sourcePageIdx].widgets.filter(w => w.id !== widgetId);
  const overlapping: PanelWidget[] = [];
  const stationary: PanelWidget[] = [];
  for (const w of sourceSiblings) {
    if (rectsOverlap(placedRect, widgetRect(w, cols))) overlapping.push(w);
    else stationary.push(w);
  }

  // Build a working set of pages with occupancy bitmaps. The source
  // page starts with the resized widget + stationary siblings only;
  // every other page keeps its current widgets.
  type WorkingPage = { id: string; widgets: PanelWidget[]; occupied: boolean[][] };
  const buildOccupancy = (widgets: readonly PanelWidget[]): boolean[][] => {
    const occ: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (const w of widgets) {
      const r = widgetRect(w, cols);
      for (let rr = r.row; rr < r.row + r.rowSpan; rr++) {
        for (let cc = r.col; cc < r.col + r.colSpan; cc++) {
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) occ[rr][cc] = true;
        }
      }
    }
    return occ;
  };
  const working: WorkingPage[] = layout.pages.map((page, idx) => {
    if (idx === sourcePageIdx) {
      const widgets = [...stationary, placed];
      return { id: page.id, widgets, occupied: buildOccupancy(widgets) };
    }
    return { id: page.id, widgets: [...page.widgets], occupied: buildOccupancy(page.widgets) };
  });

  // Walk displaced widgets in row-major order - outcome is deterministic
  // regardless of how the source page stored them.
  const sorted = overlapping.slice().sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col,
  );

  // Stride-aligned slots first, then a stride-1 pass so displaced
  // widgets home into off-stride free space before spilling to the
  // next page (or failing the resize outright).
  const findFitOnPage = (
    occupied: boolean[][],
    colSpan: number,
    rowSpan: number,
  ): { col: number; row: number } | null => {
    for (const step of strideScanSteps(colSpan, rowSpan)) {
      for (let r = 0; r + rowSpan <= rows; r += step.row) {
        for (let c = 0; c + colSpan <= cols; c += step.col) {
          let fits = true;
          for (let rr = r; rr < r + rowSpan && fits; rr++) {
            for (let cc = c; cc < c + colSpan && fits; cc++) {
              if (occupied[rr][cc]) fits = false;
            }
          }
          if (fits) return { col: c, row: r };
        }
      }
    }
    return null;
  };

  for (const w of sorted) {
    const span = sizeToSpan(w.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    if (rowSpan > rows) return null; // physically can't fit anywhere

    let landing: { pageIdx: number; col: number; row: number } | null = null;
    // Source page first (so resizing in place doesn't shuffle siblings to
    // page 2 unnecessarily), then later pages, then earlier pages.
    const pageOrder: number[] = [
      sourcePageIdx,
      ...working.map((_, i) => i).filter(i => i > sourcePageIdx),
      ...working.map((_, i) => i).filter(i => i >= 0 && i < sourcePageIdx),
    ];
    for (const pageIdx of pageOrder) {
      const slot = findFitOnPage(working[pageIdx].occupied, colSpan, rowSpan);
      if (slot) {
        landing = { pageIdx, col: slot.col, row: slot.row };
        break;
      }
    }

    // No existing page fits - spawn a new trailing page if we have room.
    if (!landing && working.length < maxPages) {
      working.push({
        id: createUuid(),
        widgets: [],
        occupied: Array.from({ length: rows }, () => Array(cols).fill(false)),
      });
      landing = { pageIdx: working.length - 1, col: 0, row: 0 };
    }

    if (!landing) return null;

    const target = working[landing.pageIdx];
    for (let rr = landing.row; rr < landing.row + rowSpan; rr++) {
      for (let cc = landing.col; cc < landing.col + colSpan; cc++) {
        target.occupied[rr][cc] = true;
      }
    }
    target.widgets.push({ ...w, col: landing.col, row: landing.row });
  }

  return {
    ...layout,
    pages: working.map(wp => ({ id: wp.id, widgets: wp.widgets })),
  };
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
