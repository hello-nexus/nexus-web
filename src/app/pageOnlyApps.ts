// Sidebar apps that are a page and nothing else - no dashboard widget, so they
// can't live in APP_REGISTRY (AppManifest requires a Widget, and its `listed`
// flag is shared with the Add-a-Widget picker). They pin, reorder, and search
// exactly like a widget-backed app; they simply have no tile.
//
// Only the store is pinned by default (see sidebarAppKeys); the rest are
// reachable from the sidebar's Show more list and global search until pinned.

import { Film, Hammer, Store } from 'lucide-react';
import type { AppIcon } from '../panel/widgets/types';

export interface PageOnlyApp {
  i18nKey: string;
  icon: AppIcon;
}

export const PAGE_ONLY_APPS: Record<string, PageOnlyApp> = {
  // Frames (FPS history) is browsed on its page; Dashboard mounts FramesPage
  // directly, so nothing under panel/widgets/frames registers a tile.
  frames: { i18nKey: 'panel.widget.frames', icon: Film },
  store: { i18nKey: 'apps.tabs.store', icon: Store },
  build: { i18nKey: 'panel.widget.build', icon: Hammer },
};

export function isPageOnlyAppKey(key: string): boolean {
  return Object.hasOwn(PAGE_ONLY_APPS, key);
}
