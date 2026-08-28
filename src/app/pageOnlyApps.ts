// Sidebar apps that are a page and nothing else - no dashboard widget, so they
// can't live in APP_REGISTRY (AppManifest requires a Widget, and its `listed`
// flag is shared with the Add-a-Widget picker). They pin, reorder, and search
// exactly like a widget-backed app; they simply have no tile.
//
// Not pinned by default: an entry here is reachable from the Add-app drawer
// and global search until the user pins it.

import { ShoppingBag } from 'lucide-react';
import type { AppIcon } from '../panel/widgets/types';

export interface PageOnlyApp {
  i18nKey: string;
  icon: AppIcon;
}

export const PAGE_ONLY_APPS: Record<string, PageOnlyApp> = {
  store: { i18nKey: 'apps.tabs.store', icon: ShoppingBag },
};

export function isPageOnlyAppKey(key: string): boolean {
  return Object.hasOwn(PAGE_ONLY_APPS, key);
}
