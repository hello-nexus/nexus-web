// Sidebar pinnable-set derivation, no JSX / icon imports. The set of
// apps that *can* be pinned is whichever apps in the registry ship a
// `Page` component - no separate hand-curated list. The set of apps
// that ARE pinned in a fresh profile is the small DEFAULT_PINNED_TAIL
// curated here (one design choice we don't want to derive).

import { APP_REGISTRY, lookupApp } from '../panel/widgets/registry';
import { getPreinstalledPageAppTypes, hasMarketplaceLoadedOnce, isMarketplaceType, normalizeAppType } from '../widgets/marketplaceRegistry';

export const DASHBOARD_APP_KEY = 'dashboard' as const;
export type SidebarAppKey = string; // any app type that has a Page, or 'dashboard'

// True iff a widget type has a desktop SPA Page - i.e. it's pinnable to the
// sidebar AND its tile becomes click-through. Built-ins read from the static
// registry; marketplace (SDK) apps resolve their synthetic manifest, so a
// page-capable SDK app (the clock) pins exactly like a native one.
export function isPinnableAppKey(s: string): boolean {
  if (APP_REGISTRY[s]?.Page != null) return true;
  if (isMarketplaceType(s)) return lookupApp(s)?.Page != null;
  return false;
}

// Default sidebar ordering for a fresh profile. Curated, not derived: it
// encodes which apps a new user sees before customising. Clock is pinnable
// in the registry but omitted to keep the tail short. Devices has no Page
// (it's a launcher widget drilling into per-device pages) and lives in the
// dedicated DEVICES section instead.
export const DEFAULT_PINNED_TAIL: string[] = ['monitoring', 'lighting', 'cooling', 'diagnostics'];

// Default tail for a fresh profile: the curated base plus any preinstalled
// page-app (OEM bake-in - e.g. a bundled device app). The
// preinstalled set is registry-derived, so it's empty until the marketplace
// registry loads and only non-empty on a build that bundles such an app; the
// sidebar re-renders on registry load (same path as user-pinned SDK apps).
function defaultPinnedTail(): string[] {
  const out = [...DEFAULT_PINNED_TAIL];
  for (const type of getPreinstalledPageAppTypes()) {
    if (!out.includes(type) && isPinnableAppKey(type)) out.push(type);
  }
  return out;
}

// Normalize a tail array read from settings/server: rewrite legacy
// marketplace:-prefixed keys (the tail lives in client storage, so the
// server-side v11 migration never sees it), drop unknown keys (apps that
// no longer exist, or never did), dedupe while preserving
// first-occurrence order. Returns a brand-new array.
//
// An app (SDK) key can't be confirmed pinnable until the marketplace registry
// loads (async). While it's still loading, preserve app-typed keys rather than
// strip them, or a cold refresh would persist a tail with the OEM/user app
// dropped and silently unpin it for good - usePanelLayout preserves unknown
// marketplace WIDGETS through the same window. After load, a genuinely
// uninstalled app key is not pinnable and falls through.
export function sanitizePinnedTail(input: readonly unknown[] | undefined): string[] {
  if (!input || !Array.isArray(input)) return defaultPinnedTail();
  const registryPending = !hasMarketplaceLoadedOnce();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    const key = normalizeAppType(entry);
    if (seen.has(key)) continue;
    if (!isPinnableAppKey(key) && !(registryPending && isMarketplaceType(key))) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// FIFO window for the sidebar's below-separator "recently opened" rows
// (macOS dock semantics) - the last RECENTS_CAP unpinned apps opened,
// oldest first.
const RECENTS_CAP = 3;

// Normalize a recents array read from settings/server: same legacy-prefix
// rewrite and pinnable-key filter as sanitizePinnedTail, deduped preserving
// first-occurrence order, then capped to the last RECENTS_CAP entries (the
// newest). Whether a key is currently pinned is not this function's concern -
// callers filter pinned keys out separately, since this sanitizer has no
// pinned-tail context and pinning is meant to strip the recents entry anyway.
export function sanitizeRecents(input: readonly unknown[] | undefined): string[] {
  if (!input || !Array.isArray(input)) return [];
  const registryPending = !hasMarketplaceLoadedOnce();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    const key = normalizeAppType(entry);
    if (seen.has(key)) continue;
    if (!isPinnableAppKey(key) && !(registryPending && isMarketplaceType(key))) continue;
    seen.add(key);
    out.push(key);
  }
  return out.slice(-RECENTS_CAP);
}

// Append `key` to the recents FIFO: a newly opened key is appended at the
// end, evicting the oldest (index 0) once the list would exceed RECENTS_CAP.
// Re-opening a key already in the list is a no-op - its position, and its
// position in the eviction order, never changes. Returns the same array
// reference (not a copy) on the no-op path, so a caller can skip a write by
// comparing the result to its input with `!==`.
export function appendRecent(list: readonly string[], key: string): string[] {
  if (list.includes(key)) return list as string[];
  const next = [...list, key];
  return next.length > RECENTS_CAP ? next.slice(next.length - RECENTS_CAP) : next;
}
