import type { ReactNode } from 'react';
import { Activity, Clock, Fan, LayoutDashboard, Lightbulb, Usb } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';

// Canonical desktop "apps" — widgets whose SPA view already exists and that
// can therefore be pinned in the sidebar. Dashboard is implicit (always at
// row 0, immovable and unpinnable). The remaining entries are user-pinnable
// and reorderable through the sidebar UI.
//
// Adding a new app here means:
//   1. populate SIDEBAR_APP_META below with its icon + i18n label key,
//   2. wire its case in Dashboard.renderMyComputerView,
//   3. (optional) seed it into DEFAULT_PINNED_TAIL so a fresh profile
//      sees it without the user having to pin manually.
export const PINNABLE_APP_KEYS = ['monitoring', 'lighting', 'cooling', 'devices', 'clock'] as const;
export type PinnableAppKey = (typeof PINNABLE_APP_KEYS)[number];

export const DASHBOARD_APP_KEY = 'dashboard' as const;
export type SidebarAppKey = typeof DASHBOARD_APP_KEY | PinnableAppKey;

export const DEFAULT_PINNED_TAIL: PinnableAppKey[] = ['monitoring', 'lighting', 'cooling', 'devices'];

interface SidebarAppMeta {
  icon: ReactNode;
  i18nKey: string;
}

export const SIDEBAR_APP_META: Record<SidebarAppKey, SidebarAppMeta> = {
  dashboard:  { icon: <LayoutDashboard size={ICON_SIZE} />, i18nKey: 'nav.dashboard' },
  monitoring: { icon: <Activity size={ICON_SIZE} />,        i18nKey: 'nav.monitoring' },
  lighting:   { icon: <Lightbulb size={ICON_SIZE} />,       i18nKey: 'nav.lighting' },
  cooling:    { icon: <Fan size={ICON_SIZE} />,             i18nKey: 'nav.cooling' },
  devices:    { icon: <Usb size={ICON_SIZE} />,             i18nKey: 'nav.devices' },
  clock:      { icon: <Clock size={ICON_SIZE} />,           i18nKey: 'nav.clock' },
};

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
