import type { PanelDeviceRecord } from '../../api/panel';
import { getPanelGridSizingSettings } from '../../lib/panelSimulation';
import { panelGridCapacityForCanvas } from './grid';
import type { PaginateCapacity } from './paginate';

export interface RecordCanvas { width: number; height: number; dpr: number }

/** The CSS-px canvas a record's panel lays out on: the size its kiosk window reported, else the display's capabilities. */
export function recordCanvasOf(
  record: Pick<PanelDeviceRecord, 'kioskViewport' | 'capabilities'> | null | undefined,
): RecordCanvas | null {
  const viewport = record?.kioskViewport;
  if (viewport?.cssWidth && viewport.cssHeight) {
    return { width: viewport.cssWidth, height: viewport.cssHeight, dpr: viewport.dpr || 1 };
  }
  const caps = record?.capabilities;
  return caps?.cssWidth && caps.cssHeight ? { width: caps.cssWidth, height: caps.cssHeight, dpr: caps.dpr || 1 } : null;
}

/** True when the record's reported kiosk viewport is the window's current size, so grid math from the window is not transient. */
export function kioskViewportSettled(
  viewport: { cssWidth: number; cssHeight: number } | null | undefined,
  win: { innerWidth: number; innerHeight: number },
): boolean {
  return !!viewport && Math.abs(viewport.cssWidth - win.innerWidth) <= 1 && Math.abs(viewport.cssHeight - win.innerHeight) <= 1;
}

/** The monitor grid for a canvas in CSS px at the given device pixel ratio; the kiosk and the editor both size from it. */
export function monitorGridCapacity(
  canvas: { width: number; height: number },
  dpr: number,
  dpi: number,
  paddingRatio: number,
  shortSideSlots?: number,
): PaginateCapacity {
  const capacity = panelGridCapacityForCanvas(
    Math.max(1, Math.round(canvas.width * dpr)),
    Math.max(1, Math.round(canvas.height * dpr)),
    {
      surface: 'monitor',
      dpi,
      // The kiosk's readRuntimePanelGrid honors the dev sizing knob; omitting it diverges the editor grid.
      sizing: getPanelGridSizingSettings(),
      shortSideSlots,
      paddingRatio,
    },
  );
  return { gridCols: capacity.columns, pageRows: capacity.rows };
}

/** The Y70 grid for a canvas in CSS px; a forced column count keeps square cells, otherwise the fixed Y70 rows. */
export function y70GridCapacity(
  canvas: { width: number; height: number },
  dpr: number,
  dpi: number,
  paddingRatio: number,
  shortSideSlots?: number,
): PaginateCapacity {
  const capacity = panelGridCapacityForCanvas(
    Math.max(1, Math.round(canvas.width * dpr)),
    Math.max(1, Math.round(canvas.height * dpr)),
    { surface: 'y70', dpi, sizing: getPanelGridSizingSettings(), shortSideSlots, paddingRatio },
  );
  return { gridCols: capacity.columns, pageRows: capacity.rows };
}
