// .tsx because getSidebarAppMeta returns JSX via createElement; the public
// surface is helpers + re-exports, not a component.
 
import { type ReactNode, createElement } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';
import { APP_REGISTRY, getCatalogEntries, lookupApp } from '../panel/widgets/registry';
import { isMarketplaceType } from '../widgets/marketplaceRegistry';
import { DEV_TOOLS } from '../lib/devTools';
import { DASHBOARD_APP_KEY } from './sidebarAppKeys';
import { PAGE_ONLY_APPS } from './pageOnlyApps';

// Re-export the leaf-module helpers so existing imports from
// './sidebarApps' keep working.
export {
  DASHBOARD_APP_KEY,
  DEFAULT_PINNED_TAIL,
  appendRecent,
  isPinnableAppKey,
  sanitizeAppOrder,
  sanitizePinnedTail,
  sanitizeRecents,
  type SidebarAppKey,
} from './sidebarAppKeys';

interface SidebarAppMeta {
  icon: ReactNode;
  i18nKey: string;
}

// The home surface (AppsView) isn't a registered App - it hosts the dashboard
// and the app picker. Hardcode its meta here. Its title shares
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
  const pageOnly = PAGE_ONLY_APPS[key];
  if (pageOnly) {
    return { icon: createElement(pageOnly.icon, { size: ICON_SIZE }), i18nKey: pageOnly.i18nKey };
  }
  // Built-ins read the static registry; marketplace (SDK) apps resolve their
  // synthetic manifest so a pinned SDK page renders its icon + name.
  const manifest = APP_REGISTRY[key] ?? (isMarketplaceType(key) ? lookupApp(key) : undefined);
  if (!manifest || !manifest.Page) return null;
  return {
    icon: createElement(manifest.meta.icon, { size: ICON_SIZE }),
    i18nKey: manifest.meta.i18nKey,
  };
}

/**
 * Every app the sidebar can list: page-only apps plus each catalog app with a
 * desktop Page. The `listed` filter is the widget catalog's: an app delisted on
 * beta/prod is resolvable but not browseable, and DEV_TOOLS builds browse
 * everything. Reads the marketplace registry's module-level cache, so callers
 * derive it per render rather than memoising it.
 */
export function listSidebarAppKeys(): string[] {
  return [
    ...Object.keys(PAGE_ONLY_APPS),
    ...getCatalogEntries().flatMap(([key, def]) => {
      if (def.Page == null) return [];
      if (!DEV_TOOLS && def.meta.listed === false) return [];
      return [key];
    }),
  ];
}
