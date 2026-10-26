import type { PanelConfigValue } from '../panel/types';
import type { OverlayWidgetDto } from '../api/overlay';

// Applies a partial config to one widget and returns both the next layout and
// the full merged config to persist. The merge is computed here, outside any
// React state updater, because an updater may run after the caller reads its
// result, which left the PATCH unsent and the toggle only in local state until
// the next server reload reverted it.
export function mergeWidgetConfig(
  layout: OverlayWidgetDto[],
  id: string,
  patch: Record<string, PanelConfigValue>,
): { layout: OverlayWidgetDto[]; merged: Record<string, PanelConfigValue> | null } {
  let merged: Record<string, PanelConfigValue> | null = null;
  const next = layout.map(entry => {
    if (entry.id !== id) return entry;
    merged = { ...entry.config, ...patch };
    return { ...entry, config: merged };
  });
  return { layout: next, merged };
}
