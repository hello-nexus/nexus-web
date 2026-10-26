import type { DesktopImportDto } from '../../api/panel';
import { createUuid } from '../../lib/uuid';
import type { PanelLayout, PanelPage, PanelWidget } from '../types';
import { GRID_SLOTS_MAX, GRID_SLOTS_MIN } from '../types';
import { panelGridCapacityForCanvas, panelWidgetPaddingRatio, sizeToSpan } from './grid';
import { rectsOverlap } from './paginate';
import { MAX_PANEL_PAGES } from './panelGrid';

// Legacy overlay widget card inset per side, in the overlay's own px.
const LEGACY_INSET_PX = 6;

/** Maps a legacy size to the one the display surface allows for that type; `slots` is the forced short-axis count when known. */
export type SizeSnapper = (type: string, size: string, forced: { slots: number; landscape: boolean } | undefined) => string;

export interface ImportViewport {
  // CSS px.
  w: number;
  h: number;
  dpr: number;
}

export interface ImportGrid {
  columns: number;
  rows: number;
  // CSS px.
  cellSize: number;
  rowSize: number;
  gap: number;
  padding: number;
}

export interface DesktopImportPlan {
  layout: PanelLayout;
  // The density chosen for a fresh panel; undefined when merging into the current grid.
  gridSlots: number | undefined;
  grid: ImportGrid;
  // Visible cell the legacy layout drew, and the relative error of the chosen grid's cell against it.
  legacyCell: number;
  cellError: number;
}

interface Rect { col: number; row: number; colSpan: number; rowSpan: number }

function gridFor(vp: ImportViewport, slots: number, paddingRatio: number): ImportGrid {
  const dpr = vp.dpr > 0 ? vp.dpr : 1;
  const cap = panelGridCapacityForCanvas(
    Math.max(1, Math.round(vp.w * dpr)),
    Math.max(1, Math.round(vp.h * dpr)),
    { surface: 'monitor', shortSideSlots: slots, paddingRatio },
  );
  return {
    columns: cap.columns,
    rows: cap.rows,
    cellSize: cap.cellSize / dpr,
    rowSize: cap.rowSize / dpr,
    gap: cap.gap / dpr,
    padding: cap.padding / dpr,
  };
}

/** The even short-axis count whose cell best matches `legacyCell`; ties take the smaller count. */
export function bestGridSlots(vp: ImportViewport, paddingRatio: number, legacyCell: number): { slots: number; grid: ImportGrid } {
  let best: { slots: number; grid: ImportGrid; err: number } | null = null;
  for (let n = GRID_SLOTS_MIN; n <= GRID_SLOTS_MAX; n += 2) {
    const grid = gridFor(vp, n, paddingRatio);
    const err = Math.abs(grid.cellSize - legacyCell);
    if (!best || err < best.err - 1e-9) best = { slots: n, grid, err };
  }
  return { slots: best!.slots, grid: best!.grid };
}

function rectOf(w: PanelWidget): Rect {
  const span = sizeToSpan(w.size);
  return { col: w.col, row: w.row, colSpan: span.cols, rowSpan: span.rows };
}

function fits(rect: Rect, grid: ImportGrid): boolean {
  return rect.col >= 0 && rect.row >= 0 && rect.col + rect.colSpan <= grid.columns && rect.row + rect.rowSpan <= grid.rows;
}

function free(rect: Rect, widgets: readonly PanelWidget[]): boolean {
  return !widgets.some(w => rectsOverlap(rect, rectOf(w)));
}

// Nearest free cell to (col, row) by Euclidean distance, scanning row-major so ties are stable.
function nearestFree(col: number, row: number, span: { cols: number; rows: number }, grid: ImportGrid, widgets: readonly PanelWidget[]) {
  let best: { col: number; row: number } | null = null;
  let bestDist = Infinity;
  for (let r = 0; r + span.rows <= grid.rows; r++) {
    for (let c = 0; c + span.cols <= grid.columns; c++) {
      if (!free({ col: c, row: r, colSpan: span.cols, rowSpan: span.rows }, widgets)) continue;
      const dist = (c - col) ** 2 + (r - row) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { col: c, row: r };
      }
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Places a legacy desktop-widget layout on a display panel's grid. Density is chosen so the
 * panel's cell matches the legacy visible cell, then each position rounds to the nearest cell.
 * A widget is never dropped: an occupied spot moves to the nearest free cell, a full page to the next.
 */
export function planDesktopImport(
  imp: DesktopImportDto,
  vp: ImportViewport,
  paddingPercent: number,
  layout: PanelLayout,
  currentGrid?: ImportGrid,
  snapSize?: SizeSnapper,
): DesktopImportPlan {
  const dpr = vp.dpr > 0 ? vp.dpr : 1;
  const unit = imp.cellUnits === 'device' ? dpr : 1;
  const stride = imp.cellPx / unit;
  const inset = LEGACY_INSET_PX / unit;
  const legacyCell = Math.max(1, stride - inset * 2);
  const paddingRatio = panelWidgetPaddingRatio(paddingPercent);

  let slots: number | undefined;
  let grid: ImportGrid;
  if (imp.merge && currentGrid) {
    grid = currentGrid;
  } else {
    const best = bestGridSlots(vp, paddingRatio, legacyCell);
    slots = best.slots;
    grid = best.grid;
  }

  const colStride = grid.cellSize + grid.gap;
  const rowStride = grid.rowSize + grid.gap;
  const pages: PanelPage[] = layout.pages.map(p => ({ ...p, widgets: [...p.widgets] }));
  const existing = new Set(pages.flatMap(p => p.widgets.map(w => w.id)));
  const used = new Set(existing);

  const ordered = [...imp.widgets].sort((a, b) => a.row - b.row || a.col - b.col || a.id.localeCompare(b.id));
  for (const legacy of ordered) {
    // An id already on the panel is a widget placed by an earlier run; a clash inside the import gets a fresh id.
    if (existing.has(legacy.id)) continue;
    const id = used.has(legacy.id) ? createUuid() : legacy.id;
    used.add(id);
    const size = snapSize ? snapSize(legacy.type, legacy.size, slots === undefined ? undefined : { slots, landscape: vp.w > vp.h }) : legacy.size;
    const span = sizeToSpan(size);
    // The legacy window clamps a stored cell to the viewport before drawing it.
    const maxCol = Math.max(0, vp.w / stride - span.cols);
    const maxRow = Math.max(0, vp.h / stride - span.rows);
    const x = clamp(legacy.col, 0, maxCol) * stride + inset;
    const y = clamp(legacy.row, 0, maxRow) * stride + inset;
    const col = clamp(Math.round((x - grid.padding) / colStride), 0, Math.max(0, grid.columns - span.cols));
    const row = clamp(Math.round((y - grid.padding) / rowStride), 0, Math.max(0, grid.rows - span.rows));

    const widget: PanelWidget = {
      id,
      type: legacy.type,
      size: size as PanelWidget['size'],
      col,
      row,
      ...(legacy.locked ? { locked: true } : {}),
      ...(legacy.config ? { config: legacy.config } : {}),
    };
    placeWidget(pages, widget, span, grid);
  }

  return {
    layout: { ...layout, pages: pages.length > 0 ? pages : [{ id: createUuid(), widgets: [] }] },
    gridSlots: slots,
    grid,
    legacyCell,
    cellError: Math.abs(grid.cellSize - legacyCell) / legacyCell,
  };
}

function placeWidget(pages: PanelPage[], widget: PanelWidget, span: { cols: number; rows: number }, grid: ImportGrid): void {
  for (let i = 0; i < MAX_PANEL_PAGES; i++) {
    if (!pages[i]) pages.push({ id: createUuid(), widgets: [] });
    const page = pages[i];
    const wanted: Rect = { col: widget.col, row: widget.row, colSpan: span.cols, rowSpan: span.rows };
    if (fits(wanted, grid) && free(wanted, page.widgets)) {
      page.widgets.push(widget);
      return;
    }
    const spot = nearestFree(widget.col, widget.row, span, grid, page.widgets);
    if (spot) {
      page.widgets.push({ ...widget, col: spot.col, row: spot.row });
      return;
    }
  }
  // Every page is full: stack on the last one and let the render-time repack sort it out.
  pages[pages.length - 1].widgets.push(widget);
}

/** True when the record carries a legacy layout this build has not placed yet. */
export function hasPendingImport(imp: DesktopImportDto | null | undefined): imp is DesktopImportDto {
  return !!imp && imp.version === 1 && Array.isArray(imp.widgets);
}
