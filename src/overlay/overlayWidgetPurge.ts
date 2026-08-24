import { APP_REGISTRY } from '../panel/widgets/registry';
import type { OverlayWidgetDto } from '../api/overlay';

// Desktop-overlay copies of a panel-only widget can only render as an inert
// tile, so they are unpinned rather than shown. Scoped to `panelOnly` alone:
// every other reason a type can be desktop-unavailable either cannot reach
// the overlay or carries widget config that must not be deleted silently.
// Types absent from the registry (marketplace apps) are left alone, with one
// exception: `discord` was a first-party widget that shipped pinnable and has
// since been removed, so a stale pin would otherwise sit invisible on the
// canvas forever and show as the raw type string in the widgets modal.
const REMOVED_FIRST_PARTY_TYPES = new Set(['discord']);

export function purgePanelOnlyOverlayWidgets(
  widgets: OverlayWidgetDto[],
  remove: (id: string) => void,
): OverlayWidgetDto[] {
  return widgets.filter(entry => {
    if (REMOVED_FIRST_PARTY_TYPES.has(entry.type)) {
      remove(entry.id);
      return false;
    }
    if (!APP_REGISTRY[entry.type]?.meta.panelOnly) return true;
    remove(entry.id);
    return false;
  });
}
