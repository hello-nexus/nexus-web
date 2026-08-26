import { Music } from 'lucide-react';
import type { AppManifest } from '../types';
import { MediaWidget } from './MediaWidget';
import { MediaTouch } from './MediaTouch';
import { MediaSettings } from './MediaSettings';

export const mediaApp: AppManifest = {
  meta: {
    type: 'media',
    i18nKey: 'panel.widget.media',
    icon: Music,
    sizes: ['2x2', '2x4', '4x2'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: MediaWidget,
  Touch: MediaTouch,
  Settings: MediaSettings,
};
