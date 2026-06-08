// Module-level cache of installed marketplace widgets, surfaced into the
// panel widget engine. The panel registry treats every installed widget as
// a synthetic registry entry with `type = "marketplace:<id>"`, so the
// existing Add Widget catalog renders them alongside the built-in widgets
// without per-feature plumbing.

import { listInstalledWidgets } from './api';
import type { WidgetInstalledListing } from './types';

export const MARKETPLACE_TYPE_PREFIX = 'marketplace:';

/**
 * Marketplace widgets shown in the Add-a-Widget picker. nexus-service may
 * report more bundled widgets; the picker shows only the allowlisted ones to
 * stay curated. Installed widgets not on the list still resolve via
 * `lookupApp` (already-placed instances keep rendering) but aren't offered.
 */
export const ENABLED_MARKETPLACE_IDS: ReadonlySet<string> = new Set([
  // The Nexus apps (sandboxed remote-component SDK widgets — the single model).
  'com.hellonexus.weather',
  'com.hellonexus.screentime',
  'com.hellonexus.displays',
  'com.hellonexus.clock',
  'com.hellonexus.media',
]);

export function isMarketplaceIdEnabled(id: string): boolean {
  return ENABLED_MARKETPLACE_IDS.has(id);
}

export function isMarketplaceType(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.startsWith(MARKETPLACE_TYPE_PREFIX);
}

export function marketplaceIdFromType(type: string): string | null {
  if (!isMarketplaceType(type)) return null;
  return type.slice(MARKETPLACE_TYPE_PREFIX.length);
}

export function typeForMarketplace(id: string): string {
  return `${MARKETPLACE_TYPE_PREFIX}${id}`;
}

const cache = new Map<string, WidgetInstalledListing>();
const listeners = new Set<() => void>();
let loadInFlight: Promise<void> | null = null;
let lastLoadAt = 0;
const STALE_AFTER_MS = 30_000;

export function getMarketplaceListing(id: string): WidgetInstalledListing | undefined {
  return cache.get(id);
}

export function getAllMarketplaceListings(): WidgetInstalledListing[] {
  return [...cache.values()].sort((a, b) => a.name.localeCompare(b.name));
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
 * panel layout reconciler to decide whether a `marketplace:<id>` widget
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
export async function loadMarketplaceWidgets(): Promise<void> {
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    try {
      const list = await listInstalledWidgets();
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
export function _seedMarketplaceRegistryForTests(entries: WidgetInstalledListing[]): void {
  cache.clear();
  for (const w of entries) cache.set(w.id, w);
  lastLoadAt = Date.now();
}
