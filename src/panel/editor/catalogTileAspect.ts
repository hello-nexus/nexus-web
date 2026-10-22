import { sizeToSpan } from '../engine/grid';
import { singleWidgetSurfaceSize, type PanelSurface } from '../types';

// A single-widget surface hosts one tile that fills the whole glass, so the
// browse tile must take the glass's shape rather than the grid's square cells.
// Returns the row track height that gives that tile the glass aspect
// (width / height) at the catalog's column width, or undefined when the
// surface lays out a normal grid or the aspect is unknown.
export function catalogRowSizeForGlass(
  surface: PanelSurface,
  glassAspect: number | undefined,
  cellSize: number,
  gap: number,
): number | undefined {
  const size = singleWidgetSurfaceSize(surface);
  if (!size || !glassAspect || !Number.isFinite(glassAspect) || glassAspect <= 0) return undefined;
  const { cols, rows } = sizeToSpan(size);
  const tileWidth = cols * cellSize + (cols - 1) * gap;
  const tileHeight = tileWidth / glassAspect;
  const row = (tileHeight - (rows - 1) * gap) / rows;
  return row > 0 ? row : undefined;
}
