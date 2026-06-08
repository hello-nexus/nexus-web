// Sidebar pinnable-set derivation, no JSX / icon imports. The set of
// apps that *can* be pinned is whichever apps in the registry ship a
// `Page` component — no separate hand-curated list. The set of apps
// that ARE pinned in a fresh profile is the small DEFAULT_PINNED_TAIL
// curated here (one design choice we don't want to derive).

import { APP_REGISTRY, lookupApp } from '../panel/widgets/registry';
import { isMarketplaceType } from '../widgets/marketplaceRegistry';

export const DASHBOARD_APP_KEY = 'dashboard' as const;
export type SidebarAppKey = string; // any app type that has a Page, or 'dashboard'

// True iff a widget type has a desktop SPA Page — i.e. it's pinnable to the
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
export const DEFAULT_PINNED_TAIL: string[] = ['monitoring', 'lighting', 'cooling'];

// Normalize a tail array read from settings/server: drop unknown
// keys (apps that no longer exist, or never did), dedupe while
// preserving first-occurrence order. Returns a brand-new array.
export function sanitizePinnedTail(input: readonly unknown[] | undefined): string[] {
  if (!input || !Array.isArray(input)) return [...DEFAULT_PINNED_TAIL];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    if (!isPinnableAppKey(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}
