// Module-level cache of installed marketplace widgets, surfaced into the
// panel widget engine. The panel registry treats every installed widget as
// a synthetic registry entry with `type = "app:<id>"`, so the
// existing Add Widget catalog renders them alongside the built-in widgets
// without per-feature plumbing.

import { listInstalledApps } from './api';
import type { AppInstalledListing } from './types';

export const APP_TYPE_PREFIX = 'app:';

export function isMarketplaceType(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.startsWith(APP_TYPE_PREFIX);
}

export function marketplaceIdFromType(type: string): string | null {
  if (!isMarketplaceType(type)) return null;
  return type.slice(APP_TYPE_PREFIX.length);
}

export function typeForMarketplace(id: string): string {
  return `${APP_TYPE_PREFIX}${id}`;
}

const cache = new Map<string, AppInstalledListing>();
const listeners = new Set<() => void>();
let loadInFlight: Promise<void> | null = null;
let lastLoadAt = 0;
const STALE_AFTER_MS = 30_000;

export function getMarketplaceListing(id: string): AppInstalledListing | undefined {
  return cache.get(id);
}

export function getAllMarketplaceListings(): AppInstalledListing[] {
  return [...cache.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether a marketplace app is shown in the Add-a-Widget picker. Every
 * general-purpose SDK app (screentime / displays / media / weather, ...) has
 * a native built-in equivalent, so those stay delisted to avoid offering two
 * of each - the picker enables only a listing the service flags `preinstalled
 * && page`, i.e. the OEM bake-in app on the machine it was bundled for.
 * Installed-but-delisted widgets still resolve via `lookupApp`
 * (already-placed instances keep rendering) but aren't offered.
 */
export function isMarketplaceIdEnabled(id: string): boolean {
  const listing = getMarketplaceListing(id);
  return !!listing?.preinstalled && !!listing?.page;
}

/**
 * `app:<id>` types for installed apps flagged `preinstalled` that ship a
 * page surface - the OEM bake-in set the sidebar auto-pins on a fresh profile.
 * Empty until the registry has loaded and only non-empty on a build that
 * actually bundles such an app, so non-OEM builds are unaffected.
 */
export function getPreinstalledPageAppTypes(): string[] {
  return getAllMarketplaceListings()
    .filter(app => app.preinstalled && app.page)
    .map(app => typeForMarketplace(app.id));
}

export function subscribeMarketplaceRegistry(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isMarketplaceRegistryStale(): boolean {
  return cache.size === 0 || Date.now() - lastLoadAt > STALE_AFTER_MS;
}

/**
 * Has the marketplace registry ever completed a successful load? Used by the
 * panel layout reconciler to decide whether an `app:<id>` widget
 * whose listing is missing should be treated as "still loading" (keep) or
 * "stale id, no longer installed" (drop silently).
 */
export function hasMarketplaceLoadedOnce(): boolean {
  return lastLoadAt > 0;
}

/**
 * Refresh the cache from the nexus-service. Coalesces concurrent calls into
 * one in-flight request and re-fires the listener set after success.
 * Failures leave the previous cache intact so the dashboard doesn't lose
 * its widget list on a transient blip.
 */
export async function loadMarketplaceApps(): Promise<void> {
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    try {
      const list = await listInstalledApps();
      cache.clear();
      for (const widget of list) cache.set(widget.id, widget);
      lastLoadAt = Date.now();
      for (const fn of listeners) {
        try { fn(); } catch { /* listener bug, swallow */ }
      }
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
}

/** Test seam: drop the cache + listener set. */
export function _resetMarketplaceRegistryForTests(): void {
  cache.clear();
  listeners.clear();
  loadInFlight = null;
  lastLoadAt = 0;
}

/** Test seam: mark the registry as loaded with a custom set. */
export function _seedMarketplaceRegistryForTests(entries: AppInstalledListing[]): void {
  cache.clear();
  for (const w of entries) cache.set(w.id, w);
  lastLoadAt = Date.now();
}
