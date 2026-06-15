import {
  normalizePanelWidgetSize,
  type PanelSurface,
  type PanelWidgetSize,
} from '../types';

// Grid is 4 columns wide on the short axis by default. Phone landscape keeps
// that short-axis capacity as rows and derives columns from the wider axis.
export const PANEL_GRID_COLS = 4;
export const PANEL_LARGE_GRID_COLS = 8;
export const PANEL_Q60_GRID_COLS = 2;
export const PANEL_Q60_GRID_ROWS = 4;
// Y70 portrait: 4x16 fixed. A canvas-derived row count drifts with the panel
// model (~14 at native 682x2560); pinning it to 16 keeps placement stable and
// paginates overflow to the next page instead of restacking the grid.
export const PANEL_Y70_PORTRAIT_ROWS = 16;
export const PANEL_GRID_GAP = 8;
export const PANEL_GRID_PREVIEW_PADDING = 8;
export const DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES = 4;

export interface PanelGridCapacity {
  columns: number;
  rows: number;
  cellSize: number;
  rowSize: number;
  contentScale: number;
}

export interface GridSpan { cols: number; rows: number; }

export interface PanelGridSizing {
  shortSideJumpAtInches?: number;
}

export function sizeToSpan(size: PanelWidgetSize | string): GridSpan {
  switch (normalizePanelWidgetSize(size)) {
    case '1x1': return { cols: 1, rows: 1 };
    case '2x2': return { cols: 2, rows: 2 };
    case '2x4': return { cols: 2, rows: 4 };
    case '4x2': return { cols: 4, rows: 2 };
    case '4x4': return { cols: 4, rows: 4 };
  }
}

// Cell stride a widget snaps to on each axis. 1x1 snaps every cell;
// every multi-cell widget snaps in 2-cell increments so a 4x4 can
// land at col/row 2 instead of being locked to multiples of 4.
export function snapStride(span: number): number {
  return span <= 1 ? 1 : 2;
}

export function panelGridCapacityForCanvas(
  width: number,
  height: number,
  {
    surface = 'y70',
    dpi,
    sizing,
    columns,
    rows,
    gap = PANEL_GRID_GAP,
    padding = PANEL_GRID_PREVIEW_PADDING,
  }: {
    surface?: PanelSurface;
    dpi?: number;
    sizing?: PanelGridSizing;
    columns?: number;
    rows?: number;
    gap?: number;
    padding?: number;
  } = {},
): PanelGridCapacity {
  const defaultColumns = surface === 'q60'
    ? PANEL_Q60_GRID_COLS
    : columnsForPhysicalSize(width, height, dpi, sizing);
  const defaultRows = surface === 'q60'
    ? PANEL_Q60_GRID_ROWS
    : surface === 'y70' && height >= width
      ? PANEL_Y70_PORTRAIT_ROWS
      : undefined;
  const fixedRows = rows ?? defaultRows;
  const safeGap = Math.max(0, gap);
  const safePadding = Math.max(0, padding);
  const canvasW = Math.max(1, width);
  const canvasH = Math.max(1, height);

  // Phone + promoted-monitor surfaces are fully responsive: in landscape the
  // short-axis capacity becomes rows and columns derive from the wider axis.
  if ((surface === 'phone' || surface === 'monitor') && canvasW > canvasH && columns === undefined && fixedRows == null) {
    return phoneLandscapeGridCapacityForCanvas(canvasW, canvasH, defaultColumns, safeGap, safePadding);
  }

  const safeColumns = toEvenRound(columns ?? defaultColumns);
  const contentW = Math.max(1, canvasW - safePadding * 2 - safeGap * (safeColumns - 1));
  const cellSize = contentW / safeColumns;
  const contentH = Math.max(1, canvasH - safePadding * 2);
  const safeRows = fixedRows == null
    ? toEvenFloor((contentH + safeGap) / (cellSize + safeGap))
    : toEvenRound(fixedRows);
  const rowSize = fixedRows == null
    ? cellSize
    : Math.max(1, (contentH - safeGap * (safeRows - 1)) / safeRows);

  return {
    columns: safeColumns,
    rows: safeRows,
    cellSize,
    rowSize,
    // contentScale drives --panel-scale (the widget render scale ratio). Use
    // cellSize rather than min(cell, row) so fixed-row surfaces (y70, q60) with
    // short rows don't shrink widget content; the cellScaler CSS override handles
    // the non-square card height per-surface.
    contentScale: cellSize,
  };
}

function phoneLandscapeGridCapacityForCanvas(
  canvasW: number,
  canvasH: number,
  shortAxisSlots: number,
  safeGap: number,
  safePadding: number,
): PanelGridCapacity {
  const safeRows = toEvenRound(shortAxisSlots);
  const contentH = Math.max(1, canvasH - safePadding * 2);
  const rowSize = Math.max(1, (contentH - safeGap * (safeRows - 1)) / safeRows);
  const contentW = Math.max(1, canvasW - safePadding * 2);
  const safeColumns = toEvenFloor((contentW + safeGap) / (rowSize + safeGap));

  return {
    columns: safeColumns,
    rows: safeRows,
    cellSize: rowSize,
    rowSize,
    contentScale: rowSize,
  };
}

export function panelPhysicalSize(width: number, height: number, dpi: number): {
  widthInches: number;
  heightInches: number;
  shortSideInches: number;
  diagonalInches: number;
} {
  const safeDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 1;
  const widthInches = Math.max(0, width) / safeDpi;
  const heightInches = Math.max(0, height) / safeDpi;
  return {
    widthInches,
    heightInches,
    shortSideInches: Math.min(widthInches, heightInches),
    diagonalInches: Math.hypot(widthInches, heightInches),
  };
}

export function columnsForPhysicalSize(
  width: number,
  height: number,
  dpi: number | undefined,
  sizing: PanelGridSizing | undefined,
): number {
  if (!Number.isFinite(dpi) || !dpi || dpi <= 0) return PANEL_GRID_COLS;
  const configuredJumpAtInches = sizing?.shortSideJumpAtInches;
  const jumpAtInches = configuredJumpAtInches !== undefined && Number.isFinite(configuredJumpAtInches)
    ? Math.max(1, configuredJumpAtInches)
    : DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES;
  const physical = panelPhysicalSize(width, height, dpi);
  return physical.shortSideInches >= jumpAtInches ? PANEL_LARGE_GRID_COLS : PANEL_GRID_COLS;
}

function toEvenRound(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function toEvenFloor(value: number): number {
  const floored = Math.max(2, Math.floor(value));
  return floored % 2 === 0 ? floored : Math.max(2, floored - 1);
}
