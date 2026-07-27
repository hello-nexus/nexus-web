/**
 * Integer cell size (px) that fits a `cols` x `rows` logical grid inside an
 * `availableWidth` x `availableHeight` box, preserving square cells. Floors
 * rather than rounds so the grid never overflows its container by a
 * sub-pixel. Returns 0 when the box or grid is degenerate.
 */
export function computeGameCellSize(
  availableWidth: number,
  availableHeight: number,
  cols: number,
  rows: number,
): number {
  if (availableWidth <= 0 || availableHeight <= 0 || cols <= 0 || rows <= 0) return 0;
  return Math.floor(Math.min(availableWidth / cols, availableHeight / rows));
}
