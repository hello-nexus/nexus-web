import type { AppManifest } from '../types';
import { TwitchLogo } from './TwitchLogo';
import { TwitchWidget } from './TwitchWidget';
import { TwitchSettings } from './TwitchSettings';

export const twitchApp: AppManifest = {
  meta: {
    type: 'twitch',
    i18nKey: 'panel.widget.twitch',
    icon: TwitchLogo,
    sizes: ['2x4', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: TwitchWidget,
  Settings: TwitchSettings,
};
