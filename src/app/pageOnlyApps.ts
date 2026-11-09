// Sidebar apps whose page is not an APP_REGISTRY Page (AppManifest hangs a Page
// off a Widget, and its `listed` flag is shared with the Add-a-Widget picker).
// They pin, reorder, and search like a widget-backed app. Frames and store have
// no tile; build's tile is an APP_REGISTRY entry with no Page, so this entry owns
// its sidebar row.
//
// None is pinned by default (see sidebarAppKeys); each is reachable from the
// sidebar's Show more list and global search until pinned.

import { Film, Settings, Store } from 'lucide-react';
import { BUILD_ICON } from './buildEntry';
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
  settings: { i18nKey: 'settings.title', icon: Settings },
  build: { i18nKey: 'panel.widget.build', icon: BUILD_ICON },
};

export function isPageOnlyAppKey(key: string): boolean {
  return Object.hasOwn(PAGE_ONLY_APPS, key);
}
