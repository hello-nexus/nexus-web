// .tsx because getSidebarAppMeta returns JSX via createElement; the public
// surface is helpers + re-exports, not a component.
 
import { type ReactNode, createElement } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { ICON_SIZE } from './sidebarNav';
import { APP_REGISTRY, lookupApp } from '../panel/widgets/registry';
import { getMarketplaceListing, isMarketplaceType, marketplaceIdFromType } from '../widgets/marketplaceRegistry';
import { AppIconImage } from '../components/icons/AppIconImage';
import { DASHBOARD_APP_KEY } from './sidebarAppKeys';

// Re-export the leaf-module helpers so existing imports from
// './sidebarApps' keep working.
export {
  DASHBOARD_APP_KEY,
  DEFAULT_PINNED_TAIL,
  appendRecent,
  isPinnableAppKey,
  sanitizePinnedTail,
  sanitizeRecents,
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

// The authed asset URL for a preinstalled (OEM bake-in) app's own manifest
// icon, or undefined for any other app (which falls back to the generic glyph).
export function preinstalledIconUrl(key: string): string | undefined {
  if (!isMarketplaceType(key)) return undefined;
  const id = marketplaceIdFromType(key);
  if (!id) return undefined;
  const listing = getMarketplaceListing(id);
  return listing?.preinstalled && listing.iconUrl ? listing.iconUrl : undefined;
}

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
  const iconUrl = preinstalledIconUrl(key);
  return {
    icon: iconUrl
      ? <AppIconImage src={iconUrl} size={ICON_SIZE} />
      : createElement(manifest.meta.icon, { size: ICON_SIZE }),
    i18nKey: manifest.meta.i18nKey,
  };
}
