import { ImageIcon } from 'lucide-react';
import type { AppManifest } from '../types';
import { GalleryWidget } from './GalleryWidget';
import { GallerySettings } from './GallerySettings';

export const galleryApp: AppManifest = {
  meta: {
    type: 'gallery',
    i18nKey: 'panel.widget.gallery',
    icon: ImageIcon,
    sizes: ['1x1', '2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: GalleryWidget,
  Settings: GallerySettings,
};
