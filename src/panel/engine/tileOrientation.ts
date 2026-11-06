import { parseWidgetSizeSpan, singleWidgetSurfaceSize, type PanelSurface } from '../types';

/** A quarter turn (90 or 270) swaps the render width and height; 0 and 180 do not. */
export function isQuarterTurn(rotation: number | null | undefined): boolean {
  return rotation === 90 || rotation === 270;
}

/** The service keeps one layout per class: landscape (0, 180) and portrait (90, 270). */
export function rotationClass(rotation: number | null | undefined): 'landscape' | 'portrait' {
  return isQuarterTurn(rotation) ? 'portrait' : 'landscape';
}

/** True when a rotation change moves between the landscape and portrait layout slots. */
export function rotationCrossesClass(from: number | null | undefined, to: number | null | undefined): boolean {
  return rotationClass(from) !== rotationClass(to);
}

/**
 * Whether a single-widget surface's tile has its axes swapped. Only a quarter
 * turn can; the tile then follows the effective render size (taller than wide
 * gets the tall tile), never the surface's name. Without a size the tile swaps
 * from the surface's base shape. Square tiles never swap.
 */
export function tileTransposed(
  surface: PanelSurface,
  rotation: number | null | undefined,
  canvas?: { width: number; height: number } | null,
): boolean {
  if (!isQuarterTurn(rotation)) return false;
  const base = singleWidgetSurfaceSize(surface);
  const span = base ? parseWidgetSizeSpan(base) : null;
  if (!span || span.cols === span.rows) return false;
  if (!canvas || canvas.width === canvas.height || !(canvas.width > 0) || !(canvas.height > 0)) return true;
  return (span.rows > span.cols) !== (canvas.height > canvas.width);
}
