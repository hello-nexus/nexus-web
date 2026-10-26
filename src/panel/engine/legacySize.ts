import { forcedGridOf, isFreeformWidgetSize, normalizePanelWidgetSizeForSurface, type PanelWidgetSize } from '../types';
import { lookupApp, sizesForSurface } from '../widgets/registry';
import type { SizeSnapper } from './desktopImport';
import { nearestAllowedSize } from './usePanelLayout';

/** Snaps a legacy desktop size to the nearest one the type allows on a display panel, as the layout reconcile does. */
export const snapLegacySize: SizeSnapper = (type, size, forced) => {
  const def = lookupApp(type);
  if (!def) return size;
  const requested = normalizePanelWidgetSizeForSurface(size, 'monitor');
  if (def.meta.freeform && isFreeformWidgetSize(requested)) return requested;
  const allowed = sizesForSurface(def.meta, 'monitor', true, forced ? forcedGridOf(forced.slots, forced.landscape) : undefined);
  return nearestAllowedSize(requested, allowed as PanelWidgetSize[], def.meta.defaultSize);
};
