// Marketplace registry sync for panel surfaces. The desktop dashboard loads
// the registry itself (Dashboard.tsx) and the add-widget catalog loads it on
// open, but a kiosk/phone panel has no other trigger - a placed `app:*`
// widget resolves to no manifest (PanelDragCells renders nothing for it) and
// stays an empty cell until the catalog is opened. Loads once the layout
// carries an app widget and re-renders the panel when the registry lands so
// lookupApp resolves.

import { useEffect, useReducer } from 'react';
import {
  isMarketplaceRegistryStale,
  isMarketplaceType,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';
import type { PanelLayout } from '../types';

export function useMarketplaceAppsSync(layout: PanelLayout): void {
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  const hasAppWidget = layout.pages.some(p => p.widgets.some(w => isMarketplaceType(w.type)));
  useEffect(() => {
    if (!hasAppWidget) return;
    if (isMarketplaceRegistryStale()) void loadMarketplaceApps();
    return subscribeMarketplaceRegistry(forceRender);
  }, [hasAppWidget, forceRender]);
}
