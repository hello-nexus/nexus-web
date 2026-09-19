import { Smile } from 'lucide-react';
import type { AppManifest } from '../types';
import { EmojiWidget } from './EmojiWidget';

export const emojiApp: AppManifest = {
  meta: {
    type: 'emoji',
    i18nKey: 'panel.widget.emoji',
    icon: Smile,
    sizes: ['4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: EmojiWidget,
};
