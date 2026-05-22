import { Gamepad2 } from 'lucide-react';
import type { AppManifest } from '../types';
import { SteamWidget } from './SteamWidget';
import { SteamSettings } from './SteamSettings';

export const steamApp: AppManifest = {
  meta: {
    type: 'steam',
    i18nKey: 'panel.widget.steam',
    icon: Gamepad2,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
  },
  Widget: SteamWidget,
  Settings: SteamSettings,
};
