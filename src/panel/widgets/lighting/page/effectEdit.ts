/**
 * Whether the selected effect tile offers the edit pencil. With a selection, the grid's
 * selected tile is the effect the dock edits, so only a blank grid effect (mixed
 * selection, global color) has no tile to edit. With nothing selected, Off and a
 * detached tab keep the plain re-pick: it restarts the mode or flashes the scope chip,
 * and a detached tab's dock is locked.
 */
export function effectEditEnabled(dockCollapsed: boolean, gridEffect: string, hasSelection: boolean, globalTabLive: boolean): boolean {
  return dockCollapsed && gridEffect !== '' && (hasSelection || globalTabLive);
}
