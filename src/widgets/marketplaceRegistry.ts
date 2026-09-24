// Module-level cache of installed marketplace widgets, surfaced into the
// panel widget engine. The panel registry treats every installed widget as
// a synthetic registry entry with `type = "app:<id>"`, so the
// existing Add Widget catalog renders them alongside the built-in widgets
// without per-feature plumbing.

import { listInstalledApps } from './api';
import type { AppInstalledListing } from './types';

export const APP_TYPE_PREFIX = 'app:';

/** Pre-rename placement prefix. Persisted data can still carry it - the
 *  localStorage pinned-sidebar tail (never server-migrated) and layouts
 *  served by a pre-v11 service (my.hellonexus.com version skew). Rewrite on
 *  read via normalizeAppType; nothing may emit it. */
export const LEGACY_APP_TYPE_PREFIX = 'marketplace:';

/** Rewrite a legacy-prefixed placement type/key to the app: prefix; every
 *  other string passes through untouched. */
export function normalizeAppType(type: string): string {
  return type.startsWith(LEGACY_APP_TYPE_PREFIX)
    ? APP_TYPE_PREFIX + type.slice(LEGACY_APP_TYPE_PREFIX.length)
    : type;
}

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
let lastLoadError = '';
const STALE_AFTER_MS = 30_000;

export function getMarketplaceListing(id: string): AppInstalledListing | undefined {
  return cache.get(id);
}

export function getAllMarketplaceListings(): AppInstalledListing[] {
  return [...cache.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether a marketplace app is shown in the Add-a-Widget picker. The bundled
 * general-purpose SDK apps (timer, stopwatch, showcase) have native built-in
 * equivalents, so those stay delisted to avoid offering two of each - of the
 * bundled set the picker enables only a listing the service flags
 * `preinstalled && page`, i.e. the OEM bake-in app on the machine it was
 * bundled for. An app in the user apps root (`source: 'user'`: a store install
 * or a manual copy) is always offered: the user chose it, and without a picker
 * entry it could never be placed on a release build. A user copy of a bundled
 * id shadows the bundled one and lists too, which is that user's own doing.
 * Installed-but-delisted widgets still resolve via `lookupApp`
 * (already-placed instances keep rendering) but aren't offered.
 */
export function isMarketplaceIdEnabled(id: string): boolean {
  const listing = getMarketplaceListing(id);
  if (!listing) return false;
  if (listing.source === 'user') return true;
  return !!listing.preinstalled && !!listing.page;
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

export function marketplaceLoadError(): string { return lastLoadError; }

export function isMarketplaceRegistryStale(): boolean {
  return cache.size === 0 || Date.now() - lastLoadAt > STALE_AFTER_MS;
}

/** Whether the last successful read is older than the freshness window. Unlike
 *  isMarketplaceRegistryStale, an empty cache is an answer ("nothing installed")
 *  rather than a permanent unknown, so a caller deciding whether the registry
 *  may be trusted about a missing id does not wait forever on an empty machine. */
export function isMarketplaceRegistryExpired(): boolean {
  return Date.now() - lastLoadAt > STALE_AFTER_MS;
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
      lastLoadError = '';
      for (const fn of listeners) {
        try { fn(); } catch { /* listener bug, swallow */ }
      }
    } catch (e) {
      // TEMP EXPERIMENT: previously this threw out of a `void` call, so a single
      // failed boot-time load left the cache empty and lastLoadAt at 0 forever -
      // a kiosk panel then resolved every app:<id> to undefined and rendered a
      // blank cell. Record it and stay stale so a caller can retry.
      lastLoadError = String((e as Error)?.message ?? e).slice(0, 60);
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
}

let reloadInFlight: Promise<boolean> | null = null;

/**
 * Refresh from a change that has already happened, reporting whether the cache
 * actually reloaded. An in-flight load may have issued its request before that
 * change, so joining it (what loadMarketplaceApps does) can settle on a listing
 * that predates the install; reloads prompted by the same change do share one.
 */
export function reloadMarketplaceApps(): Promise<boolean> {
  if (reloadInFlight) return reloadInFlight;
  reloadInFlight = (async () => {
    if (loadInFlight) await loadInFlight;
    await loadMarketplaceApps();
    return lastLoadError === '';
  })().finally(() => { reloadInFlight = null; });
  return reloadInFlight;
}

/** Test seam: drop the cache + listener set. */
export function _resetMarketplaceRegistryForTests(): void {
  cache.clear();
  listeners.clear();
  loadInFlight = null;
  reloadInFlight = null;
  lastLoadAt = 0;
  lastLoadError = '';
}

/** Test seam: mark the registry as loaded with a custom set. */
export function _seedMarketplaceRegistryForTests(entries: AppInstalledListing[]): void {
  cache.clear();
  for (const w of entries) cache.set(w.id, w);
  lastLoadAt = Date.now();
}
