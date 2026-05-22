// Leaf module: pinnable-app key constants + helpers, with no React /
// JSX / icon imports. Panel engine code reads from here so it doesn't
// drag the sidebar's icon set into the kiosk bundle.
//
// The accompanying sidebarApps.tsx imports these constants and adds the
// icon + i18n metadata used by the sidebar UI itself.

// Widget types that have a desktop SPA "app page" — clicking the widget
// tile (when embedded in the dashboard panel) navigates to that page,
// and the widget can be pinned to the sidebar. Adding a new app means
// extending this list, wiring the route in Dashboard.renderMyComputerView,
// and adding the icon + label to SIDEBAR_APP_META in sidebarApps.tsx.
export const PINNABLE_APP_KEYS = ['monitoring', 'lighting', 'cooling', 'devices', 'clock'] as const;
export type PinnableAppKey = (typeof PINNABLE_APP_KEYS)[number];

export const DASHBOARD_APP_KEY = 'dashboard' as const;
export type SidebarAppKey = typeof DASHBOARD_APP_KEY | PinnableAppKey;

// Default ordering applied to a fresh profile. Clock is deliberately
// omitted — existing users shouldn't get a surprise new row; they opt in
// via right-click "Pin to Sidebar" or by dragging from the dashboard.
export const DEFAULT_PINNED_TAIL: PinnableAppKey[] = ['monitoring', 'lighting', 'cooling', 'devices'];

export function isPinnableAppKey(s: string): s is PinnableAppKey {
  return (PINNABLE_APP_KEYS as readonly string[]).includes(s);
}

// Normalize a tail array read from settings/server: drop unknown keys, dedupe
// while preserving first-occurrence order. Returns a brand-new array.
export function sanitizePinnedTail(input: readonly unknown[] | undefined): PinnableAppKey[] {
  if (!input || !Array.isArray(input)) return [...DEFAULT_PINNED_TAIL];
  const out: PinnableAppKey[] = [];
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
