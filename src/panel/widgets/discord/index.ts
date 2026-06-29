import { MessageCircle } from 'lucide-react';
import type { AppManifest } from '../types';
import { DiscordWidget } from './DiscordWidget';
import { DiscordSettings } from './DiscordSettings';

export const discordApp: AppManifest = {
  meta: {
    type: 'discord',
    i18nKey: 'panel.widget.discord',
    icon: MessageCircle,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
    listed: false,
  },
  Widget: DiscordWidget,
  Settings: DiscordSettings,
};
