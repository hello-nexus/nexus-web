/**
 * Whether a generic display panel has its widgets locked. The record's own flag wins; a record that
 * predates it counts as locked when every widget carried the old per-widget lock. Stored per-widget
 * flags are never rewritten.
 */
export function resolveWidgetsLocked(widgetsLocked: boolean | null | undefined, widgets: ReadonlyArray<{ locked?: boolean }>): boolean {
  if (typeof widgetsLocked === 'boolean') return widgetsLocked;
  return widgets.length > 0 && widgets.every(w => Boolean(w.locked));
}
