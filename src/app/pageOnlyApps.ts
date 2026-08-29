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
  // Gating this entry is what removes the store everywhere: pinning, pin
  // sanitizing, the add-app drawer and search all resolve through this record.
  ...(DEV_TOOLS ? { store: { i18nKey: 'apps.tabs.store', icon: ShoppingBag } } : {}),
};

export function isPageOnlyAppKey(key: string): boolean {
  return Object.hasOwn(PAGE_ONLY_APPS, key);
}
