// Pure planning for the OEM bake-in seed-once reconcile. Separated from the
// React hook (useOemAppSeed.ts) so the idempotency logic - which widgets and
// sidebar keys are missing - is unit-testable without mounting the panel
// engine.

import type { PanelLayout } from '../types';
import type { AppInstalledListing } from '../../widgets/types';
import { typeForMarketplace } from '../../widgets/marketplaceRegistry';

export interface OemAppSeedPlan {
  /** marketplace:<id> types missing from the dashboard layout. */
  widgetTypesToAdd: string[];
  /** marketplace:<id> keys missing from the pinned sidebar tail. */
  sidebarKeysToAdd: string[];
}

/**
 * The service gates `preinstalled` on the PC manufacturer - true only for the
 * OEM app on a machine built by that OEM. That flag, combined with `page`
 * (the app ships a section view worth pinning), is the sole signal for what
 * this seed places.
 */
function oemListings(listings: readonly AppInstalledListing[]): AppInstalledListing[] {
  return listings.filter(app => app.preinstalled && app.page);
}

export function planOemAppSeed(
  listings: readonly AppInstalledListing[],
  layout: PanelLayout,
  pinnedSidebarApps: readonly string[],
): OemAppSeedPlan {
  const oemTypes = oemListings(listings).map(app => typeForMarketplace(app.id));
  const placedTypes = new Set(layout.pages.flatMap(page => page.widgets.map(w => w.type)));
  return {
    widgetTypesToAdd: oemTypes.filter(type => !placedTypes.has(type)),
    sidebarKeysToAdd: oemTypes.filter(type => !pinnedSidebarApps.includes(type)),
  };
}

/** Whether the machine has any OEM bake-in app to reconcile at all. */
export function hasOemApp(listings: readonly AppInstalledListing[]): boolean {
  return oemListings(listings).length > 0;
}
