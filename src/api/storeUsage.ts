// Where an installed app is placed, and removing it from all of them.
//
// Uninstalling deletes the app's files; anything still referencing it would be
// left pointing at nothing. The reconciler drops orphans silently on the next
// load, so without this the user would find widgets simply gone with no idea
// where. Usage is therefore surfaced BEFORE the uninstall, not repaired after.
//
// Two stores, not one: panel devices keep their layout on the device record,
// while the desktop dashboard keeps its own under preferences. Scanning only
// the devices misses the dashboard entirely.

import { fetchPanelDevices, patchPanelDevice } from './panel';
import { fetchPreferences, savePreferences } from './profiles';
import { broadcastLayoutChanged } from '../panel/engine/panelSync';
import { typeForMarketplace } from '../widgets/marketplaceRegistry';
import type { PanelLayout } from '../panel/types';

export interface AppPlace {
  /** What the user calls it: "Dashboard", or the panel's own name. */
  name: string;
  /** How many copies sit there. */
  count: number;
}

export interface AppUsage {
  places: AppPlace[];
  total: number;
}

function countIn(layout: PanelLayout | undefined, type: string): number {
  let n = 0;
  for (const page of layout?.pages ?? []) {
    n += (page.widgets ?? []).filter(w => w.type === type).length;
  }
  return n;
}

function stripFrom(layout: PanelLayout, type: string): { layout: PanelLayout; removed: number } {
  let removed = 0;
  const pages = layout.pages.map(page => {
    const widgets = page.widgets ?? [];
    const kept = widgets.filter(w => w.type !== type);
    removed += widgets.length - kept.length;
    return { ...page, widgets: kept };
  });
  return { layout: { ...layout, pages }, removed };
}

/** Every place holding this app, named the way the user refers to them. */
export async function findAppUsage(appId: string, dashboardName: string): Promise<AppUsage> {
  const type = typeForMarketplace(appId);
  const [prefs, devices] = await Promise.all([fetchPreferences(), fetchPanelDevices()]);
  const places: AppPlace[] = [];

  const onDashboard = countIn(prefs?.panel?.dashboardLayout, type);
  if (onDashboard > 0) places.push({ name: dashboardName, count: onDashboard });

  for (const record of devices?.devices ?? []) {
    const count = countIn(record.layout, type);
    if (count > 0) places.push({ name: record.displayName || record.id, count });
  }
  return { places, total: places.reduce((n, p) => n + p.count, 0) };
}

/**
 * Strips every placement of the app. Only stores that actually hold it are
 * written, so an unrelated layout is never rewritten, and the open dashboard is
 * told to refetch so the widget disappears without a reload.
 */
export async function removeAppEverywhere(appId: string): Promise<number> {
  const type = typeForMarketplace(appId);
  const [prefs, devices] = await Promise.all([fetchPreferences(), fetchPanelDevices()]);
  let removed = 0;

  const dashboard = prefs?.panel?.dashboardLayout;
  if (dashboard) {
    const next = stripFrom(dashboard, type);
    if (next.removed > 0) {
      await savePreferences({ panel: { dashboardLayout: next.layout } });
      removed += next.removed;
    }
  }

  for (const record of devices?.devices ?? []) {
    if (!record.layout?.pages) continue;
    const next = stripFrom(record.layout, type);
    if (next.removed === 0) continue;
    await patchPanelDevice(record.id, { layout: next.layout });
    removed += next.removed;
  }

  if (removed > 0) broadcastLayoutChanged();
  return removed;
}
