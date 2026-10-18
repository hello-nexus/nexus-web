export const PREVIEW_CELL_PX = 90;
export const PREVIEW_GAP_PX = 6;
// The widget preview never exceeds the footprint of this many cells per side.
const PREVIEW_MAX_CELLS = 4;

export interface PreviewFit { width: number; height: number; scale: number; }

/** Full-size preview box for a span, plus the uniform scale that keeps it inside a 4x4 footprint. */
export function previewFit(cols: number, rows: number): PreviewFit {
  const width = cols * PREVIEW_CELL_PX + (cols - 1) * PREVIEW_GAP_PX;
  const height = rows * PREVIEW_CELL_PX + (rows - 1) * PREVIEW_GAP_PX;
  const max = PREVIEW_MAX_CELLS * PREVIEW_CELL_PX + (PREVIEW_MAX_CELLS - 1) * PREVIEW_GAP_PX;
  return { width, height, scale: Math.min(1, max / width, max / height) };
}
