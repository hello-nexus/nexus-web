/**
 * Whether the selected effect tile offers the edit pencil. The grid's selected tile
 * is the effect shown in the canvas, which the dock edits for any selection, so only
 * a blank grid effect (mixed selection, global color) has no tile to edit.
 */
export function effectEditEnabled(dockCollapsed: boolean, gridEffect: string): boolean {
  return dockCollapsed && gridEffect !== '';
}
