// Sidebar apps that are a page and nothing else - no dashboard widget, so they
// can't live in APP_REGISTRY (AppManifest requires a Widget, and its `listed`
// flag is shared with the Add-a-Widget picker). They pin, reorder, and search
// exactly like a widget-backed app; they simply have no tile.
//
// Not pinned by default: an entry here is reachable from the Add-app drawer
// and global search until the user pins it.

import { ShoppingBag } from 'lucide-react';
import type { AppIcon } from '../panel/widgets/types';
import { DEV_TOOLS } from '../lib/devTools';

export interface PageOnlyApp {
  i18nKey: string;
  icon: AppIcon;
}

export const PAGE_ONLY_APPS: Record<string, PageOnlyApp> = {
  // The store is DEV_TOOLS-only for now: the catalog holds one app and the
  // install path has not been exercised outside this machine. Gating the
  // registry entry is what removes it everywhere, since pinning, the add-app
  // drawer, search and pin sanitizing all resolve through this record.
  ...(DEV_TOOLS ? { store: { i18nKey: 'apps.tabs.store', icon: ShoppingBag } } : {}),
};

export function isPageOnlyAppKey(key: string): boolean {
  return Object.hasOwn(PAGE_ONLY_APPS, key);
}
