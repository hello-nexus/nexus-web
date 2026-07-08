// One-time reconcile that places the OEM bake-in app's dashboard widget and
// sidebar pin for profiles nexus-service did not already seed via
// getPreinstalledPageAppTypes (defaultPinnedTail only covers a brand-new
// profile's pinned tail, and never touches the dashboard widget). Runs once
// per session; ui.oemAppSeeded persists so a user who later removes the
// widget or unpins it keeps it removed on the next mount.

import { useEffect, useReducer, useRef } from 'react';
import { createUuid } from '../../lib/uuid';
import { isPinnableAppKey } from '../../app/sidebarAppKeys';
import { appendWidget } from './panelLayoutOps';
import type { PaginateCapacity } from './paginate';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import {
  getAllMarketplaceListings,
  hasMarketplaceLoadedOnce,
  isMarketplaceRegistryStale,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';
import { hasOemApp, planOemAppSeed } from './oemAppSeed';
import type { UiSettingsValue } from '../../hooks/useUiSettings';

// Size the OEM bake-in widget docks at on the dashboard. Must be one of the
// app manifest's declared sizes (ibuypower ships 2x2 / 4x2 / 4x4).
const OEM_WIDGET_SIZE: PanelWidgetSize = '2x2';

interface UseOemAppSeedArgs {
  /** Gated to the embedded desktop dashboard - the only surface that owns dashboardLayout writes. */
  enabled: boolean;
  layoutLoaded: boolean;
  layout: PanelLayout;
  setLayout: (next: PanelLayout) => void;
  capacity: PaginateCapacity;
  uiHydrated: boolean;
  uiSettings: UiSettingsValue;
  updateUiSettings: (patch: Partial<UiSettingsValue>) => void;
}

export function useOemAppSeed({
  enabled, layoutLoaded, layout, setLayout, capacity,
  uiHydrated, uiSettings, updateUiSettings,
}: UseOemAppSeedArgs): void {
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  useEffect(() => {
    if (!enabled) return;
    if (isMarketplaceRegistryStale()) void loadMarketplaceApps();
    return subscribeMarketplaceRegistry(forceRender);
  }, [enabled, forceRender]);

  // Guards a duplicate run within one mount (e.g. React StrictMode's
  // double-invoke); the persisted oemAppSeeded flag is what makes the
  // reconcile idempotent ACROSS mounts.
  const ranRef = useRef(false);

  // Read during render so the subscribe-driven re-render flips this false->true
  // once the registry HTTP resolves; it must be an effect dep, or a registry
  // load that lands after layout/ui are ready never re-runs the seed (cold
  // first boot of an OEM machine - exactly this feature's target).
  const marketplaceLoaded = hasMarketplaceLoadedOnce();

  useEffect(() => {
    if (!enabled || ranRef.current) return;
    if (!layoutLoaded || !uiHydrated || !marketplaceLoaded) return;
    if (uiSettings.oemAppSeeded) return;

    const listings = getAllMarketplaceListings();
    // No OEM app on this machine: skip without setting the flag, so this
    // stays a cheap no-op check rather than an extra write on every install.
    if (!hasOemApp(listings)) return;
    // Marked unconditionally past this point, even when the plan below is
    // empty (a fresh profile's default tail already placed both) - otherwise
    // a later user removal of the widget/pin would get re-seeded next mount.
    ranRef.current = true;
    const plan = planOemAppSeed(listings, layout, uiSettings.pinnedSidebarApps);

    let nextLayout = layout;
    for (const type of plan.widgetTypesToAdd) {
      const widget: PanelWidget = { id: createUuid(), type, size: OEM_WIDGET_SIZE, col: 0, row: 0 };
      nextLayout = appendWidget(nextLayout, widget, capacity, { singlePage: true });
    }
    if (nextLayout !== layout) setLayout(nextLayout);

    const pinAdds = plan.sidebarKeysToAdd.filter(isPinnableAppKey);
    const nextPinned = pinAdds.length > 0
      ? [...uiSettings.pinnedSidebarApps, ...pinAdds]
      : undefined;

    updateUiSettings({
      oemAppSeeded: true,
      ...(nextPinned ? { pinnedSidebarApps: nextPinned } : {}),
    });
  }, [enabled, layoutLoaded, uiHydrated, marketplaceLoaded, uiSettings, layout, capacity, setLayout, updateUiSettings]);
}
