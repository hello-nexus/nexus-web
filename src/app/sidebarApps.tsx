// .tsx because getSidebarAppMeta returns JSX via createElement; the public
// surface is helpers + re-exports, not a component.
 
import { type ReactNode, createElement } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';
import { APP_REGISTRY, lookupApp } from '../panel/widgets/registry';
import { isMarketplaceType } from '../widgets/marketplaceRegistry';
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

// The home surface (AppsView) isn't a registered App - it hosts the app picker
// and the Dashboard / Nexus Store tabs. Hardcode its meta here. Its title shares
// the sidebar "Apps" section label so the top bar and the sidebar read the same.
// Every other pinnable app derives its icon + label from its AppManifest.
const DASHBOARD_META: SidebarAppMeta = {
  icon: <LayoutDashboard size={ICON_SIZE} />,
  i18nKey: 'sidebar.section.apps',
};

/**
 * Resolve the icon + label the sidebar should render for a given key.
 * Returns `null` when the key is unknown (defensive - sanitizePinnedTail
 * normally filters these, but a stale settings blob could still leak
 * one through). Callers render nothing in that case.
 */
export function getSidebarAppMeta(key: string): SidebarAppMeta | null {
  if (key === DASHBOARD_APP_KEY) return DASHBOARD_META;
  // Built-ins read the static registry; marketplace (SDK) apps resolve their
  // synthetic manifest so a pinned SDK page renders its icon + name.
  const manifest = APP_REGISTRY[key] ?? (isMarketplaceType(key) ? lookupApp(key) : undefined);
  if (!manifest || !manifest.Page) return null;
  return {
    icon: createElement(manifest.meta.icon, { size: ICON_SIZE }),
    i18nKey: manifest.meta.i18nKey,
  };
}
