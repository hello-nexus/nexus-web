import type { ReactNode } from 'react';
import { Activity, Clock, Fan, LayoutDashboard, Lightbulb, Usb } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';
import type { SidebarAppKey } from './sidebarAppKeys';

// Re-export the leaf-module constants so existing imports from
// './sidebarApps' continue to work — the keys + helpers live in
// './sidebarAppKeys' (no React deps) so the panel engine can pull from
// the same source of truth without dragging in the icon set.
export {
  PINNABLE_APP_KEYS,
  DASHBOARD_APP_KEY,
  DEFAULT_PINNED_TAIL,
  isPinnableAppKey,
  sanitizePinnedTail,
  type PinnableAppKey,
  type SidebarAppKey,
} from './sidebarAppKeys';

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
