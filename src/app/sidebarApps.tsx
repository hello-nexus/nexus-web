// .tsx because getSidebarAppMeta returns JSX via createElement; the public
// surface is helpers + re-exports, not a component.
 
import { type ReactNode, createElement } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';
import { APP_REGISTRY } from '../panel/widgets/registry';
import { DASHBOARD_APP_KEY } from './sidebarAppKeys';

// Re-export the leaf-module helpers so existing imports from
// './sidebarApps' keep working.
export {
  DASHBOARD_APP_KEY,
  DEFAULT_PINNED_TAIL,
  isPinnableAppKey,
  sanitizePinnedTail,
  type SidebarAppKey,
} from './sidebarAppKeys';

interface SidebarAppMeta {
  icon: ReactNode;
  i18nKey: string;
}

// Dashboard isn't a registered App — it's the surface that hosts the
// app picker, not an app itself. Hardcode its sidebar meta here. Every
// other pinnable app derives its icon + label from its AppManifest.
const DASHBOARD_META: SidebarAppMeta = {
  icon: <LayoutDashboard size={ICON_SIZE} />,
  i18nKey: 'nav.dashboard',
};

/**
 * Resolve the icon + label the sidebar should render for a given key.
 * Returns `null` when the key is unknown (defensive — sanitizePinnedTail
 * normally filters these, but a stale settings blob could still leak
 * one through). Callers render nothing in that case.
 */
export function getSidebarAppMeta(key: string): SidebarAppMeta | null {
  if (key === DASHBOARD_APP_KEY) return DASHBOARD_META;
  const manifest = APP_REGISTRY[key];
  if (!manifest || !manifest.Page) return null;
  return {
    icon: createElement(manifest.meta.icon, { size: ICON_SIZE }),
    i18nKey: manifest.meta.i18nKey,
  };
}
