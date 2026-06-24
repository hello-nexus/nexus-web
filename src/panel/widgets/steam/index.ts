import { lazy } from 'react';
import type { AppManifest } from '../types';
import { makeWidgetTouchView } from '../common/WidgetTouchView';
import { SteamLogo } from './SteamLogo';
import { SteamSettings } from './SteamSettings';
import { SteamWidget } from './SteamWidget';

// Code-split: Page only loads when the dashboard navigates into the
// immersive view. Widget + Touch stay eager so panel cells render
// synchronously and the panel bundle never fetches Page bytes at all.
const SteamPage = lazy(() => import('./SteamPage').then(m => ({ default: m.SteamPage })));

export const steamApp: AppManifest = {
  meta: {
    type: 'steam',
    i18nKey: 'panel.widget.steam',
    icon: SteamLogo,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
    listed: false,
  },
  Widget: SteamWidget,
  Page: SteamPage,
  Touch: makeWidgetTouchView(SteamWidget),
  Settings: SteamSettings,
};
