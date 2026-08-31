import type { CollisionDetection } from '@dnd-kit/core';
import type { SettingsTabKey } from '../../components/views/SettingsView/SettingsView';
import { snapStride } from './grid';
import type { PanelLayout, PanelWidget } from '../types';
import { isPageOnlyAppKey } from '../../app/pageOnlyApps';
import { isPinnableAppKey } from '../../app/sidebarAppKeys';

// A click on a dashboard widget tile navigates to the widget's app page, keyed
// off the App registry (manifest.Page) like the sidebar pin list. Adding a
// Page to an app makes its widget click-through automatically.
export type DashboardWidgetSection = string;

export interface DashboardSectionNavigatePayload {
  // Optional deep-link key. Currently used by the devices widget to
  // ask DevicesPage to auto-open the modal for a specific device.
  deviceKey?: string;
  // Settings deep-link: tab to open, plus the SettingRow anchorId to reveal.
  settingsTab?: SettingsTabKey;
  settingsAnchor?: string;
}

export type DashboardSectionNavigate =
  (section: DashboardWidgetSection, payload?: DashboardSectionNavigatePayload) => void;

export function isDashboardClickthroughType(type: string): type is DashboardWidgetSection {
  // Click-through needs a TILE to click through from, so this is narrower than
  // sidebar-pinnable: isPinnableAppKey also admits page-only apps (Store), which
  // have no widget. A stale layout naming one must not be treated as clickable.
  return !isPageOnlyAppKey(type) && isPinnableAppKey(type);
}

export interface DragTarget { pageId: string; col: number; row: number; }

// Cursor must move this far from the long-press origin before any widget
// shifts. Without the floor, sub-pixel jitter after the long-press fires
// onDragMove, commits a new over target, and twitches surrounding widgets.
export const PANEL_DRAG_START_THRESHOLD_PX = 12;

export interface DragGestureState {
  // Pointer position at long-press activation. Reset on dragstart.
  startX: number;
  startY: number;
  // Last over id committed for this drag. Drives hysteresis so a tiny
  // jitter near a shared cell boundary does not flip the projection.
  lastOverId: string | null;
}

// Inert touch handlers for surfaces with no pointer input (Q60). The cell
// wires every cellPointers callback unconditionally, so hand back no-ops to
// keep call sites typed without listeners that could fire on a stray pointer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match React.PointerEventHandler
const noopPointerHandler = (_e: React.PointerEvent) => { /* no-op on Q60 */ };
export { noopPointerHandler };
export const noopCellPointers = {
  onPointerDown: noopPointerHandler,
  onPointerMove: noopPointerHandler,
  onPointerUp: noopPointerHandler,
  onPointerCancel: noopPointerHandler,
};

// Resolves an over droppable id to the (col, row, pageId) the active widget
// would land at. Widget ids resolve to the widget's own (col, row); empty-cell
// ids carry the coords in the id. Returns null for an unresolvable id (e.g. a
// stale widget id).
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

// Reads cell + row + gap sizes in px. Measures a real widget cell's
// offsetWidth / offsetHeight (the CSS-computed size, ignoring transforms,
// unlike getBoundingClientRect). Falls back to parsing --panel-cell-size when
// no widget is mounted yet. Shared by the drag collision detector and the
// per-cell preview translation (panel + dashboard).
export function readCellMetrics(root: HTMLElement | null): { cellSize: number; rowSize: number; gap: number } | null {
  if (!root) return null;
  const rootStyle = window.getComputedStyle(root);
  const gapRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-gap'));
  const gap = Number.isFinite(gapRaw) ? gapRaw : 0;

  // Preferred path: measure a real widget cell. data-panel-cell-* attributes
  // give its span to back out cellSize / rowSize. offsetWidth / offsetHeight
  // ignore CSS transforms, so this is the pristine grid track size even
  // mid-drag.
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

  // Fallback: parse the CSS variable. Works on the dashboard (fixed px) but
  // FAILS on kiosk surfaces where --panel-cell-size is a calc() expression
  // (parseFloat returns NaN) - hence the DOM-measurement path above.
  const cellSize = Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size'));
  if (!Number.isFinite(cellSize) || cellSize <= 0) return null;
  const rowSizeRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-row-size'));
  const rowSize = Number.isFinite(rowSizeRaw) && rowSizeRaw > 0 ? rowSizeRaw : cellSize;
  return { cellSize, rowSize, gap };
}

// Builds the collision detector. Must be a closure inside PanelContent to read
// mutable refs (long-press origin, last-committed over id) for the threshold +
// hysteresis that stop widgets twitching back and forth.
//
// The pager translates the whole track to switch pages, so dnd-kit's cached
// rects can lag the visible state. Each cell's BASELINE rect (visual rect
// minus its interpolated transform via DOMMatrix) anchors the over selection
// to the layout, not the in-flight transition.
//
// Reports the cell under the dragged widget's projected top-left: snap the
// VISUAL top-left to a (col, row) via the page's cell + gap metrics, return
// the widget there or the empty-cell droppable (iOS Springboard: it lands
// where you see it). "Closest by center" biased toward the finger and yanked
// onto adjacent widgets when landing in empty space.
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
    // Shared DOM-based cell metrics. Works on dashboard (fixed px) and kiosk
    // surfaces (calc() expression, where parseFloat would be NaN).
    const metrics = readCellMetrics(root);
    if (!metrics) return [];
    const { cellSize, rowSize, gap } = metrics;
    const stride = cellSize + gap;
    const rowStride = rowSize + gap;
    const rootStyle = window.getComputedStyle(root);
    // Snap rule: 1x1 lands on every cell; multi-cell widgets land on 2-cell
    // multiples (a 4x4 sits at col 0 or 2). Read the active's span off the
    // source cell so the snap tracks the cursor.
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

    // Lock the snap target to the current active page (the pager's edge-advance
    // dwell handles cross-page navigation), clamping the snap into its bounds.
    // The highlight then stays correct even when the dragged rect drifts off
    // the viewport - a center-grabbed 4x4 can have a top-left hundreds of px
    // off the left edge on a phone surface, which "find page containing
    // translated.left" couldn't resolve.
    const idx = activePageIndexRef.current;
    const pageEl = document.querySelector<HTMLElement>(`[data-panel-page-index="${idx}"]`);
    if (!pageEl) return [];

    const pageRect = pageEl.getBoundingClientRect();
    const pageStyle = window.getComputedStyle(pageEl);
    const padLeft = Number.parseFloat(pageStyle.paddingLeft || '0') || 0;
    const padTop = Number.parseFloat(pageStyle.paddingTop || '0') || 0;
    // Center-based snap: round the top-left cell index to the nearest snap
    // stride multiple. Math.round() puts the threshold at the half-stride
    // boundary, so the widget jumps past half a stride into a new slot.
    const localX = translated.left - pageRect.left - padLeft;
    const localY = translated.top - pageRect.top - padTop;
    const continuousCol = localX / stride;
    const continuousRow = localY / rowStride;
    const snappedCol = Math.round(continuousCol / activeColStep) * activeColStep;
    const snappedRow = Math.round(continuousRow / activeRowStep) * activeRowStep;
    // Clamp into the grid so the highlight stays visible past an edge. Max
    // snap is the largest stride multiple that keeps the rect inside the grid.
    const maxCol = Math.max(0, Math.floor((totalCols - activeColSpan) / activeColStep) * activeColStep);
    const maxRow = Math.max(0, Math.floor((totalRows - activeRowSpan) / activeRowStep) * activeRowStep);
    const col = Math.min(Math.max(0, snappedCol), maxCol);
    const row = Math.min(Math.max(0, snappedRow), maxRow);

    const pageId = pageEl.dataset.panelPageId;
    if (!pageId) return [];

    // Return the cell droppable at the snapped (col, row). Cell droppables
    // render at every (col, row) during drag, so this never fails for in-bounds
    // positions. previewDrag handles "drop where you started" via a no-op.
    const emptyId = `empty:${pageId}:${col}:${row}`;
    const emptyContainer = droppableContainers.find(c => String(c.id) === emptyId);
    if (emptyContainer) {
      gestureRef.current.lastOverId = emptyId;
      return [{ id: emptyContainer.id, data: { droppableContainer: emptyContainer, value: 0 } }];
    }
    return [];
  };
}
