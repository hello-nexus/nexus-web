// Sidebar pinnable-set derivation, no JSX / icon imports. The set of
// apps that *can* be pinned is whichever apps in the registry ship a
// `Page` component — no separate hand-curated list. The set of apps
// that ARE pinned in a fresh profile is the small DEFAULT_PINNED_TAIL
// curated here (one design choice we don't want to derive).

import { APP_REGISTRY } from '../panel/widgets/registry';

export const DASHBOARD_APP_KEY = 'dashboard' as const;
export type SidebarAppKey = string; // any app type that has a Page, or 'dashboard'

// True iff a widget type has a desktop SPA Page in the registry —
// i.e. the app is pinnable to the sidebar AND its tile becomes
// click-through on the dashboard panel.
export function isPinnableAppKey(s: string): boolean {
  return APP_REGISTRY[s]?.Page != null;
}

// Default ordering applied to a fresh profile. Curated rather than
// derived because it encodes a product choice — which apps a brand-
// new user sees in their sidebar before customising. Clock is in the
// registry as pinnable, but deliberately omitted here so the default
// tail stays four entries wide.
// Devices isn't in the default tail any more — it doesn't have a
// Page on its manifest (the Devices app is now a pure launcher
// widget that drills into per-device pages). The sidebar's DEVICES
// section is the dedicated surface for it.
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
