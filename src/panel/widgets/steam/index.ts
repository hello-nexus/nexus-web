import type { AppManifest } from '../types';
import { makeWidgetTouchView } from '../common/WidgetTouchView';
import { SteamLogo } from './SteamLogo';
import { SteamPage } from './SteamPage';
import { SteamSettings } from './SteamSettings';
import { SteamWidget } from './SteamWidget';

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
  },
  Widget: SteamWidget,
  Page: SteamPage,
  Touch: makeWidgetTouchView(SteamWidget),
  Settings: SteamSettings,
};
