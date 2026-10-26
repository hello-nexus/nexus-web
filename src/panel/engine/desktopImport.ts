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
  // Kiosk window origin inside the monitor's full frame, CSS px; the legacy overlay covered the full frame.
  originX?: number;
  originY?: number;
  // The monitor's full-frame size, CSS px, when the host reports it.
  fullW?: number;
  fullH?: number;
}

/** The origin the host passes on the kiosk URL; missing or malformed means a full-frame window. */
export function kioskOriginFromSearch(search: string): { originX: number; originY: number; fullW?: number; fullH?: number } {
  const params = new URLSearchParams(search);
  const read = (key: string) => {
    const raw = params.get(key);
    const value = raw === null || raw === '' ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const full = (key: string) => {
    const value = read(key);
    return value !== undefined && value > 0 ? value : undefined;
  };
  return { originX: read('originX') ?? 0, originY: read('originY') ?? 0, fullW: full('fullW'), fullH: full('fullH') };
}

export interface ImportGrid {
  columns: number;
  rows: number;
  // CSS px. `colSize` is the rendered column width: the runtime stretches the columns over the full width, so it can exceed `rowSize`.
  colSize: number;
  rowSize: number;
  gap: number;
  padding: number;
}

/** The grid as the runtime reports it (cellSize is its row height); the column width is solved from the viewport. */
export type RuntimeGrid = Omit<ImportGrid, 'colSize'> & { cellSize: number };

export interface DesktopImportPlan {
  layout: PanelLayout;
  // The density chosen for a fresh panel; undefined when merging into the current grid.
  gridSlots: number | undefined;
  grid: ImportGrid;
  // Visible cell the legacy layout drew, and the worst relative error of the chosen grid's column width or row height against it.
  legacyCell: number;
  cellError: number;
}

interface Rect { col: number; row: number; colSpan: number; rowSpan: number }

export function columnWidth(vp: ImportViewport, g: { columns: number; gap: number; padding: number }): number {
  return Math.max(1, (vp.w - g.padding * 2 - g.gap * (g.columns - 1)) / g.columns);
}

function gridFor(vp: ImportViewport, slots: number, paddingRatio: number): ImportGrid {
  const dpr = vp.dpr > 0 ? vp.dpr : 1;
  const cap = panelGridCapacityForCanvas(
    Math.max(1, Math.round(vp.w * dpr)),
    Math.max(1, Math.round(vp.h * dpr)),
    { surface: 'monitor', shortSideSlots: slots, paddingRatio },
  );
  const base = { columns: cap.columns, rows: cap.rows, rowSize: cap.rowSize / dpr, gap: cap.gap / dpr, padding: cap.padding / dpr };
  return { ...base, colSize: columnWidth(vp, base) };
}

function cellMismatch(grid: ImportGrid, legacyCell: number): number {
  return Math.max(Math.abs(grid.colSize - legacyCell), Math.abs(grid.rowSize - legacyCell)) / legacyCell;
}

/** The even short-axis count whose rendered column width and row height best match `legacyCell`; ties take the smaller count. */
export function bestGridSlots(vp: ImportViewport, paddingRatio: number, legacyCell: number): { slots: number; grid: ImportGrid } {
  let best: { slots: number; grid: ImportGrid; err: number } | null = null;
  for (let n = GRID_SLOTS_MIN; n <= GRID_SLOTS_MAX; n += 2) {
    const grid = gridFor(vp, n, paddingRatio);
    const err = cellMismatch(grid, legacyCell);
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
  currentGrid?: RuntimeGrid,
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
    grid = { ...currentGrid, colSize: columnWidth(vp, currentGrid) };
  } else {
    const best = bestGridSlots(vp, paddingRatio, legacyCell);
    slots = best.slots;
    grid = best.grid;
  }

  const colStride = grid.colSize + grid.gap;
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
    const originX = vp.originX ?? 0;
    const originY = vp.originY ?? 0;
    const maxCol = Math.max(0, (vp.fullW ?? vp.w + originX) / stride - span.cols);
    const maxRow = Math.max(0, (vp.fullH ?? vp.h + originY) / stride - span.rows);
    const x = clamp(legacy.col, 0, maxCol) * stride + inset - originX;
    const y = clamp(legacy.row, 0, maxRow) * stride + inset - originY;
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
    cellError: cellMismatch(grid, legacyCell),
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

/** A panel that already holds widgets keeps them and their grid; density is chosen only for an empty one. */
export function importBase(imp: DesktopImportDto, layout: PanelLayout): { imp: DesktopImportDto; base: PanelLayout } {
  const occupied = layout.pages.some(p => p.widgets.length > 0);
  if (occupied) return { imp: { ...imp, merge: true }, base: layout };
  return {
    imp: { ...imp, merge: false },
    base: { ...layout, pages: [{ id: layout.pages[0]?.id ?? 'page-1', widgets: [] }], activePageId: undefined },
  };
}

/** True when the record carries a legacy layout this build has not placed yet. */
export function hasPendingImport(imp: DesktopImportDto | null | undefined): imp is DesktopImportDto {
  return !!imp && imp.version === 1 && Array.isArray(imp.widgets);
}
