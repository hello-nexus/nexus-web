import type { PanelLayout, PanelSurface, PanelWidget } from '../types';
import { reflowLayoutToPages, fitLayoutToSinglePage, type PaginateCapacity } from './paginate';
import { monitorGridCapacity, y70GridCapacity } from './recordCanvas';

/**
 * The grid a Widget size lays out on. A size with no forced count keeps the surface's own grid, which only
 * the Y70 and monitor surfaces derive from the canvas; any other surface has no grid to refit against.
 */
export function widgetSizeCapacity(
  target: PanelSurface,
  canvas: { width: number; height: number },
  canvasDpr: number,
  dpi: number,
  paddingRatio: number,
  slots: number | undefined,
): PaginateCapacity | undefined {
  if (target === 'y70') return y70GridCapacity(canvas, canvasDpr, dpi, paddingRatio, slots);
  if (slots === undefined && target !== 'monitor') return undefined;
  return monitorGridCapacity(canvas, canvasDpr, dpi, paddingRatio, slots);
}

export type WidgetSizeFitMode = 'pages' | 'single';

/** Refits a layout to a new grid: widgets without room flow onto following pages where the panel pages, else are dropped. */
export function fitLayoutForWidgetSize(
  layout: PanelLayout,
  capacity: PaginateCapacity,
  mode: WidgetSizeFitMode,
  maxPages: number,
): { layout: PanelLayout; dropped: PanelWidget[] } {
  return mode === 'pages' ? reflowLayoutToPages(layout, capacity, maxPages) : fitLayoutToSinglePage(layout, capacity);
}
