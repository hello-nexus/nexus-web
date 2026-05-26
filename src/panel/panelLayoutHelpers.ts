import type { CollisionDetection } from '@dnd-kit/core';
import { snapStride } from './engine/grid';
import type { PanelLayout, PanelWidget } from './types';
import { isPinnableAppKey } from '../app/sidebarAppKeys';

// A click on a dashboard widget tile navigates to the widget's app
// page — same source of truth as the sidebar pin list (the App
// registry, via manifest.Page). Adding a Page to a new app
// automatically makes the corresponding widget click-through; no
// change needed here.
export type DashboardWidgetSection = string;

export interface DashboardSectionNavigatePayload {
  // Optional deep-link key. Currently used by the devices widget to
  // ask DevicesView to auto-open the modal for a specific device.
  deviceKey?: string;
}

export type DashboardSectionNavigate =
  (section: DashboardWidgetSection, payload?: DashboardSectionNavigatePayload) => void;

export function isDashboardClickthroughType(type: string): type is DashboardWidgetSection {
  return isPinnableAppKey(type);
}

export interface DragTarget { pageId: string; col: number; row: number; }

// Cursor must move this many pixels from the long-press origin before
// any other widget is allowed to shift out of the way. Without this
// floor, the pager and dnd-kit fire onDragMove on the first sub-pixel
// pointer jitter that follows the long-press, the strategy commits a
// new over target, and surrounding widgets visibly twitch even though
// the user has not "started" dragging yet.
export const PANEL_DRAG_START_THRESHOLD_PX = 12;

export interface DragGestureState {
  // Pointer position at long-press activation. Reset on dragstart.
  startX: number;
  startY: number;
  // Last over id committed for this drag. Drives hysteresis so a tiny
  // jitter near a shared cell boundary does not flip the projection.
  lastOverId: string | null;
}

// Inert touch handlers for surfaces that don't accept pointer input (Q60).
// `cellPointers` is shaped like RN's PointerEvent bag and the cell wires
// every callback unconditionally, so we hand back a no-op for each to keep
// the call sites typed without registering listeners that could fire on a
// stray simulated pointer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match React.MouseEventHandler
const noopMouseHandler = (_e: React.MouseEvent) => { /* no-op on Q60 */ };
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match React.PointerEventHandler
const noopPointerHandler = (_e: React.PointerEvent) => { /* no-op on Q60 */ };
export { noopMouseHandler, noopPointerHandler };
export const noopCellPointers = {
  onPointerDown: noopPointerHandler,
  onPointerMove: noopPointerHandler,
  onPointerUp: noopPointerHandler,
  onPointerCancel: noopPointerHandler,
};

// Resolves an over droppable id into the (col, row, pageId) the
// active widget would land at if dropped now. Widget ids resolve to
// the widget's own (col, row); empty-cell ids carry the cell coords
// in the id itself. Returns null if the id can't be resolved (e.g.
// a stale widget id from a previous render).
export function parseDragTarget(
  overId: string,
  layout: PanelLayout,
  active: PanelWidget,
): DragTarget | null {
  if (overId === active.id) return null;
  if (overId.startsWith('empty:')) {
    const rest = overId.slice(6);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    const middleColon = rest.lastIndexOf(':', lastColon - 1);
    if (middleColon < 0) return null;
    const pageId = rest.slice(0, middleColon);
    const col = Number.parseInt(rest.slice(middleColon + 1, lastColon), 10);
    const row = Number.parseInt(rest.slice(lastColon + 1), 10);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return { pageId, col, row };
  }
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === overId);
    if (w) return { pageId: page.id, col: w.col, row: w.row };
  }
  return null;
}

export function findWidgetById(layout: PanelLayout, id: string): PanelWidget | undefined {
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === id);
    if (w) return w;
  }
  return undefined;
}

// Returns a copy of `layout` with trailing empty pages removed,
// keeping at least one page so the renderer never has an empty
// `pages` array. Used after a drop commits so the drag-only phantom
// page doesn't get persisted unless a widget actually landed on it.
export function trimTrailingEmptyPages(layout: PanelLayout): PanelLayout {
  const pages = layout.pages.slice();
  while (pages.length > 1 && pages[pages.length - 1].widgets.length === 0) {
    pages.pop();
  }
  if (pages.length === layout.pages.length) return layout;
  return { ...layout, pages };
}

// Reads the panel's cell + row + gap sizes in pixels. Works on every
// surface because it measures a real widget cell's offsetWidth /
// offsetHeight (which is the resolved CSS-computed size, NOT what
// getBoundingClientRect would return after a transform). Falls back
// to parsing --panel-cell-size for the (rare) initial-render case
// when no widget is mounted yet. Single source of truth used by
// both the drag collision detector and the per-cell preview
// translation in PanelTouchCell - panel and dashboard share this.
export function readCellMetrics(root: HTMLElement | null): { cellSize: number; rowSize: number; gap: number } | null {
  if (!root) return null;
  const rootStyle = window.getComputedStyle(root);
  const gapRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-gap'));
  const gap = Number.isFinite(gapRaw) ? gapRaw : 0;

  // Preferred path: measure a real widget cell. data-panel-cell-*
  // attributes give us its span so we can back out cellSize / rowSize.
  // offsetWidth / offsetHeight ignore CSS transforms (the projection's
  // translate doesn't change the layout box) so we always get the
  // pristine grid track size, even mid-drag.
  const sample = root.querySelector<HTMLElement>(
    '[data-panel-widget-id][data-panel-cell-col-span][data-panel-cell-row-span]',
  );
  if (sample) {
    const colSpan = Math.max(1,
      Number.parseInt(sample.getAttribute('data-panel-cell-col-span') ?? '1', 10) || 1,
    );
    const rowSpan = Math.max(1,
      Number.parseInt(sample.getAttribute('data-panel-cell-row-span') ?? '1', 10) || 1,
    );
    const w = sample.offsetWidth;
    const h = sample.offsetHeight;
    const cellSize = (w - (colSpan - 1) * gap) / colSpan;
    const rowSize = (h - (rowSpan - 1) * gap) / rowSpan;
    if (Number.isFinite(cellSize) && cellSize > 0
      && Number.isFinite(rowSize) && rowSize > 0) {
      return { cellSize, rowSize, gap };
    }
  }

  // Fallback: parse the CSS variable directly. This works on the
  // dashboard where --panel-cell-size is set inline as a fixed pixel
  // value, but FAILS on panel kiosk surfaces where the variable is a
  // calc() expression - parseFloat returns NaN there. That is exactly
  // why we prefer the DOM-measurement path above.
  const cellSize = Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size'));
  if (!Number.isFinite(cellSize) || cellSize <= 0) return null;
  const rowSizeRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-row-size'));
  const rowSize = Number.isFinite(rowSizeRaw) && rowSizeRaw > 0 ? rowSizeRaw : cellSize;
  return { cellSize, rowSize, gap };
}

// Builds the panel collision detector. It must be a closure inside
// PanelContent so it can read mutable refs for the long-press origin
// and last-committed over id - those provide the threshold + hysteresis
// that prevent the surrounding widgets from twitching back and forth.
//
// The pager translates the entire track to switch pages, so dnd-kit's
// cached droppable rects can lag behind the visible state. We compute
// each cell's BASELINE rect (visual rect minus its current INTERPOLATED
// transform via DOMMatrix) so the over selection is anchored to the
// layout, not the in-flight CSS transition.
// Builds a collision detector that reports the grid cell directly
// under the dragged widget's projected top-left. We snap the widget's
// VISUAL top-left to a (col, row) using the page's cell + gap metrics,
// then return either the widget at that cell or the empty-cell
// droppable. This is what iOS Springboard does: where you SEE the
// widget is exactly where it would land. Pointer-coordinate "closest
// by center" was biased toward whatever was nearest the finger,
// which kept yanking the active onto adjacent widgets when the user
// tried to land it in empty space.
export function buildPanelCollisionDetection(
  gestureRef: { current: DragGestureState },
  activePageIndexRef: { current: number },
): CollisionDetection {
  return (args) => {
    const { droppableContainers, active, pointerCoordinates } = args;
    if (typeof document === 'undefined') return [];

    // Minimum-movement threshold (cursor distance from press anchor).
    // Below this we still don't pick an over target so a sub-threshold
    // jiggle after long-press doesn't trigger any displacement.
    if (pointerCoordinates) {
      const dx0 = pointerCoordinates.x - gestureRef.current.startX;
      const dy0 = pointerCoordinates.y - gestureRef.current.startY;
      if (dx0 * dx0 + dy0 * dy0 < PANEL_DRAG_START_THRESHOLD_PX * PANEL_DRAG_START_THRESHOLD_PX) {
        return [];
      }
    }

    const translated = active.rect.current.translated;
    if (!translated) return [];

    // Find the panel root via the source cell so we can read CSS metrics.
    const sourceCell = document.querySelector<HTMLElement>(
      `[data-panel-page-index] [data-panel-widget-id="${CSS.escape(String(active.id))}"]`,
    );
    const root = sourceCell?.closest<HTMLElement>('[data-surface]');
    if (!root) return [];
    // Shared DOM-based cell metrics. Works on dashboard (fixed px)
    // AND panel kiosk surfaces (calc() expression) - panel was
    // broken before this because parseFloat('calc(...)') is NaN.
    const metrics = readCellMetrics(root);
    if (!metrics) return [];
    const { cellSize, rowSize, gap } = metrics;
    const stride = cellSize + gap;
    const rowStride = rowSize + gap;
    const rootStyle = window.getComputedStyle(root);
    // Snap rule: 1x1 lands on every cell, every multi-cell widget
    // lands on 2-cell multiples (a 4x4 can sit at col 0 OR col 2).
    // Read the active's span off the source cell so the snap is
    // rendered accurately as the cursor moves.
    const activeColSpan = Math.max(1,
      Number.parseInt(sourceCell?.getAttribute('data-panel-cell-col-span') ?? '1', 10) || 1,
    );
    const activeRowSpan = Math.max(1,
      Number.parseInt(sourceCell?.getAttribute('data-panel-cell-row-span') ?? '1', 10) || 1,
    );
    const activeColStep = snapStride(activeColSpan);
    const activeRowStep = snapStride(activeRowSpan);
    const totalColsRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-columns'));
    const totalRowsRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-rows'));
    const totalCols = Number.isFinite(totalColsRaw) && totalColsRaw > 0 ? totalColsRaw : 4;
    const totalRows = Number.isFinite(totalRowsRaw) && totalRowsRaw > 0 ? totalRowsRaw : 4;

    // Always lock the snap target to the CURRENT active page. The
    // pager's edge-advance dwell handles cross-page navigation;
    // here we just clamp the snap into the current page's bounds.
    // This means the highlight stays visible (and correct) even when
    // the dragged widget's translated rect drifts off the viewport
    // - a 4x4 widget grabbed near its center can have a top-left
    // hundreds of pixels off the left edge on a phone surface, and
    // the previous "find page containing translated.left" logic
    // would fail to find any page and clear the highlight.
    const idx = activePageIndexRef.current;
    const pageEl = document.querySelector<HTMLElement>(`[data-panel-page-index="${idx}"]`);
    if (!pageEl) return [];

    const pageRect = pageEl.getBoundingClientRect();
    const pageStyle = window.getComputedStyle(pageEl);
    const padLeft = Number.parseFloat(pageStyle.paddingLeft || '0') || 0;
    const padTop = Number.parseFloat(pageStyle.paddingTop || '0') || 0;
    // Center-based snap: round the widget's top-left cell index to
    // the nearest multiple of the snap stride. Math.round() puts the
    // threshold at the half-stride boundary so the widget jumps once
    // the user has moved it more than half a stride into the new slot.
    const localX = translated.left - pageRect.left - padLeft;
    const localY = translated.top - pageRect.top - padTop;
    const continuousCol = localX / stride;
    const continuousRow = localY / rowStride;
    const snappedCol = Math.round(continuousCol / activeColStep) * activeColStep;
    const snappedRow = Math.round(continuousRow / activeRowStep) * activeRowStep;
    // Clamp into the grid so the highlight stays visible even when
    // the dragged widget is pushed past an edge. Max snap is the
    // largest multiple-of-stride that keeps the rect inside the grid.
    const maxCol = Math.max(0, Math.floor((totalCols - activeColSpan) / activeColStep) * activeColStep);
    const maxRow = Math.max(0, Math.floor((totalRows - activeRowSpan) / activeRowStep) * activeRowStep);
    const col = Math.min(Math.max(0, snappedCol), maxCol);
    const row = Math.min(Math.max(0, snappedRow), maxRow);

    const pageId = pageEl.dataset.panelPageId;
    if (!pageId) return [];

    // Always return the cell droppable at the snapped (col, row).
    // Cell droppables render at every (col, row) during drag, so
    // this lookup never fails for in-bounds positions and the
    // highlight stays visible the entire time. previewDrag handles
    // the "drop where you started" case via a no-op short-circuit.
    const emptyId = `empty:${pageId}:${col}:${row}`;
    const emptyContainer = droppableContainers.find(c => String(c.id) === emptyId);
    if (emptyContainer) {
      gestureRef.current.lastOverId = emptyId;
      return [{ id: emptyContainer.id, data: { droppableContainer: emptyContainer, value: 0 } }];
    }
    return [];
  };
}
