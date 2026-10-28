import type { DesktopImportDto } from '../../api/panel';
import { createUuid } from '../../lib/uuid';
import type { PanelLayout, PanelPage, PanelSurface, PanelWidget, PanelWidgetSizeMode } from '../types';
import { GRID_SLOTS_MAX, GRID_SLOTS_MIN, PANEL_WIDGET_SIZE_MODES, panelWidgetSizeOptions, widgetSizeShortSideSlots } from '../types';
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
  // The widget size chosen for a fresh panel; undefined when merging into the current grid.
  widgetSize: PanelWidgetSizeMode | undefined;
  // The short-axis count that size resolves to, for fitting the plan; never stored.
  gridSlots: number | undefined;
  // Every imported widget carried the legacy lock, which becomes the panel's lock.
  widgetsLocked: boolean;
  grid: ImportGrid;
  // Visible cell the legacy layout drew, and the worst relative error of the chosen grid's column width or row height against it.
  legacyCell: number;
  cellError: number;
}

interface Rect { col: number; row: number; colSpan: number; rowSpan: number }

export function columnWidth(vp: ImportViewport, g: { columns: number; gap: number; padding: number }): number {
  return Math.max(1, (vp.w - g.padding * 2 - g.gap * (g.columns - 1)) / g.columns);
}

function gridFor(vp: ImportViewport, slots: number | undefined, paddingRatio: number, surface: PanelSurface = 'monitor'): ImportGrid {
  const dpr = vp.dpr > 0 ? vp.dpr : 1;
  const cap = panelGridCapacityForCanvas(
    Math.max(1, Math.round(vp.w * dpr)),
    Math.max(1, Math.round(vp.h * dpr)),
    { surface, shortSideSlots: slots, paddingRatio },
  );
  const base = { columns: cap.columns, rows: cap.rows, rowSize: cap.rowSize / dpr, gap: cap.gap / dpr, padding: cap.padding / dpr };
  return { ...base, colSize: columnWidth(vp, base) };
}

function cellMismatch(grid: ImportGrid, legacyCell: number): number {
  return Math.max(Math.abs(grid.colSize - legacyCell), Math.abs(grid.rowSize - legacyCell)) / legacyCell;
}

/**
 * The widget size whose grid draws the cell closest to the legacy one. Without the glass's density the
 * even count that fits best is used and the size defaults to Small.
 */
export function bestSize(vp: ImportViewport, paddingRatio: number, legacyCell: number, densitySlots: number | undefined, glassSurface: PanelSurface = 'monitor'): { mode: PanelWidgetSizeMode; slots: number | undefined; grid: ImportGrid } {
  // A Y70 offers sizes on its own fixed grid as well; every size is measured on the surface it lays out as.
  const options = panelWidgetSizeOptions(glassSurface, undefined);
  if (glassSurface === 'monitor' ? !densitySlots : !options) {
    const fallback = bestGridSlots(vp, paddingRatio, legacyCell);
    return { mode: 'small', ...fallback };
  }
  let best: { mode: PanelWidgetSizeMode; slots: number | undefined; grid: ImportGrid; err: number } | null = null;
  for (const mode of PANEL_WIDGET_SIZE_MODES) {
    if (glassSurface !== 'monitor' && !options?.layoutSurface[mode]) continue;
    const forced = options ? widgetSizeShortSideSlots(options, mode, densitySlots) : undefined;
    const target = options?.layoutSurface[mode] ?? 'monitor';
    // A size that forces nothing keeps its surface's own columns, except on the monitor grid, which takes the density count.
    const slots = forced ?? (target === 'monitor' ? densitySlots : undefined);
    const grid = gridFor(vp, slots, paddingRatio, target);
    const err = cellMismatch(grid, legacyCell);
    if (!best || err < best.err - 1e-9) best = { mode, slots, grid, err };
  }
  return { mode: best!.mode, slots: best!.slots, grid: best!.grid };
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
  options: { singlePage?: boolean; densitySlots?: number; glassSurface?: PanelSurface; sizeOnMerge?: boolean } = {},
): DesktopImportPlan {
  const singlePage = options.singlePage ?? false;
  const dpr = vp.dpr > 0 ? vp.dpr : 1;
  const unit = imp.cellUnits === 'device' ? dpr : 1;
  const stride = imp.cellPx / unit;
  const inset = LEGACY_INSET_PX / unit;
  const legacyCell = Math.max(1, stride - inset * 2);
  const paddingRatio = panelWidgetPaddingRatio(paddingPercent);

  let slots: number | undefined;
  let widgetSize: PanelWidgetSizeMode | undefined;
  let grid: ImportGrid;
  // A merge keeps the current grid, unless the panel has no stored size yet and the import is to set it.
  if (imp.merge && currentGrid && !options.sizeOnMerge) {
    grid = { ...currentGrid, colSize: columnWidth(vp, currentGrid) };
  } else {
    const sized = bestSize(vp, paddingRatio, legacyCell, options.densitySlots, options.glassSurface);
    widgetSize = sized.mode;
    slots = sized.slots;
    grid = sized.grid;
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
    placeWidget(pages, widget, span, grid, singlePage ? 1 : MAX_PANEL_PAGES);
  }

  return {
    layout: { ...layout, pages: pages.length > 0 ? pages : [{ id: createUuid(), widgets: [] }] },
    widgetSize,
    gridSlots: slots,
    widgetsLocked: imp.widgets.length > 0 && imp.widgets.every(w => w.locked),
    grid,
    legacyCell,
    cellError: cellMismatch(grid, legacyCell),
  };
}

function placeWidget(pages: PanelPage[], widget: PanelWidget, span: { cols: number; rows: number }, grid: ImportGrid, maxPages: number): void {
  for (let i = 0; i < maxPages; i++) {
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
  // Every allowed page is full: stack on the last one and let the render-time repack sort it out.
  pages[Math.min(pages.length, maxPages) - 1].widgets.push(widget);
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
