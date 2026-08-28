import {
  isSingleWidgetSurface,
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
// Y70: fixed cell count along the long axis in either orientation, with the
// short axis carrying the columnsForPhysicalSize slot count - capacity is
// identical across a rotation, so repacking never drops or clips a widget.
// A canvas-derived count drifts with the panel model (~14 at native 682x2560);
// pinning it keeps placement stable and paginates overflow to the next page
// instead of restacking the grid.
export const PANEL_Y70_LONG_AXIS_CELLS = 16;
export const PANEL_GRID_GAP = 8;
export const PANEL_GRID_PREVIEW_PADDING = 8;
export const DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES = 4;

// The Theme "Widget padding" control is a 0-100% slider. Gap and page padding
// are both solved as a fraction of the resolved cell size (resolvePanelSpacing),
// so the inset reads as the same proportion of a widget on every device
// instead of a flat px value that reads thicker on a small cell and thinner
// on a large one. 50% (the default) reproduces the panel's original y70
// look; this constant is the ratio at 100%, tune it to change the slider's
// entire range proportionally.
export const PANEL_WIDGET_PADDING_MAX_RATIO = 0.09;

export function panelWidgetPaddingRatio(percent: number): number {
  const safePercent = Math.min(100, Math.max(0, percent));
  return (safePercent / 100) * PANEL_WIDGET_PADDING_MAX_RATIO;
}

export interface PanelGridCapacity {
  columns: number;
  rows: number;
  cellSize: number;
  rowSize: number;
  contentScale: number;
  gap: number;
  padding: number;
}

export interface GridSpan { cols: number; rows: number; }

export interface PanelGridSizing {
  shortSideJumpAtInches?: number;
}

export interface PanelSpacing {
  gap: number;
  padding: number;
  cellSize: number;
}

// Solves gap = padding = ratio * cellSize directly from the extent and cell
// count, avoiding the circular CSS dependency a var()-chain formula would hit
// (gap needs cellSize, cellSize needs gap). `extent = count * cellSize +
// (count + 1) * gap` (the (count - 1) internal gaps plus 2 outer paddings)
// substituted with gap = ratio * cellSize solves to this closed form directly
// - no iteration.
export function resolvePanelSpacing(extent: number, count: number, ratio: number): PanelSpacing {
  const safeExtent = Math.max(1, extent);
  const safeCount = Math.max(1, count);
  const safeRatio = Math.max(0, ratio);
  const cellSize = safeExtent / (safeCount + safeRatio * (safeCount + 1));
  const gap = safeRatio * cellSize;
  return { gap, padding: gap, cellSize };
}

export function sizeToSpan(size: PanelWidgetSize | string): GridSpan {
  switch (normalizePanelWidgetSize(size)) {
    case '1x1': return { cols: 1, rows: 1 };
    case '2x2': return { cols: 2, rows: 2 };
    case '2x4': return { cols: 2, rows: 4 };
    case '4x2': return { cols: 4, rows: 2 };
    case '4x4': return { cols: 4, rows: 4 };
    // Round is a 2x2 block; only its rendering is circular.
    case '2x2round': return { cols: 2, rows: 2 };
  }
}

// Cell stride a widget snaps to on each axis. 1x1 snaps every cell;
// every multi-cell widget snaps in 2-cell increments so a 4x4 can
// land at col/row 2 instead of being locked to multiples of 4.
export function snapStride(span: number): number {
  return span <= 1 ? 1 : 2;
}

// Scan passes for placement searches: stride-aligned first (snap
// aesthetics), then every cell so off-stride free space (left by 1x1
// neighbours or a tight repack) still accepts the widget instead of
// the search reporting "no room" while blank cells are visible.
export function strideScanSteps(colSpan: number, rowSpan: number): { col: number; row: number }[] {
  const col = snapStride(colSpan);
  const row = snapStride(rowSpan);
  if (col === 1 && row === 1) return [{ col, row }];
  return [{ col, row }, { col: 1, row: 1 }];
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
    paddingRatio,
  }: {
    surface?: PanelSurface;
    dpi?: number;
    sizing?: PanelGridSizing;
    columns?: number;
    rows?: number;
    gap?: number;
    padding?: number;
    // When set, gap/padding are solved via resolvePanelSpacing instead of
    // using the gap/padding arguments directly. Forced to 0 on a
    // single-widget surface (q60) regardless of the value passed in - any
    // inset there reads as a border around the one tile.
    paddingRatio?: number;
  } = {},
): PanelGridCapacity {
  // Y70 landscape transposes the portrait grid: the fixed long-axis cell
  // count becomes columns and the short-axis slot count becomes rows, so
  // cell geometry and capacity match portrait exactly. Explicit columns/rows
  // arguments own the geometry and bypass the transpose, mirroring
  // isPhoneLandscape below.
  const y70Landscape = surface === 'y70' && width > height
    && columns === undefined && rows === undefined;
  const shortAxisSlots = columnsForPhysicalSize(width, height, dpi, sizing);
  const defaultColumns = surface === 'q60'
    ? PANEL_Q60_GRID_COLS
    : y70Landscape
      ? PANEL_Y70_LONG_AXIS_CELLS
      : shortAxisSlots;
  const defaultRows = surface === 'q60'
    ? PANEL_Q60_GRID_ROWS
    : y70Landscape
      ? shortAxisSlots
      : surface === 'y70' && height >= width
        ? PANEL_Y70_LONG_AXIS_CELLS
        : undefined;
  const fixedRows = rows ?? defaultRows;
  const canvasW = Math.max(1, width);
  const canvasH = Math.max(1, height);
  const resolvedPaddingRatio = paddingRatio === undefined
    ? undefined
    : isSingleWidgetSurface(surface) ? 0 : paddingRatio;

  // Phone + promoted-monitor surfaces are fully responsive: in landscape the
  // short-axis capacity becomes rows and columns derive from the wider axis.
  const isPhoneLandscape = (surface === 'phone' || surface === 'monitor')
    && canvasW > canvasH && columns === undefined && fixedRows == null;

  let safeGap: number;
  let safePadding: number;
  if (resolvedPaddingRatio === undefined) {
    safeGap = Math.max(0, gap);
    safePadding = Math.max(0, padding);
  } else {
    // Landscape reflows solve spacing against the short (vertical) axis with
    // the short-axis slot count, so the gap matches the portrait solve of the
    // same physical panel and survives a rotation unchanged.
    const spacing = isPhoneLandscape
      ? resolvePanelSpacing(canvasH, toEvenRound(defaultColumns), resolvedPaddingRatio)
      : y70Landscape
        ? resolvePanelSpacing(canvasH, toEvenRound(shortAxisSlots), resolvedPaddingRatio)
        : resolvePanelSpacing(canvasW, toEvenRound(columns ?? defaultColumns), resolvedPaddingRatio);
    safeGap = spacing.gap;
    safePadding = spacing.padding;
  }

  if (isPhoneLandscape) {
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
    gap: safeGap,
    padding: safePadding,
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
    gap: safeGap,
    padding: safePadding,
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
