import { createElement, lazy } from 'react';
import { ImageIcon } from 'lucide-react';
import type { AppManifest, WidgetProps } from '../types';
import { GalleryWidget } from './GalleryWidget';
import { GallerySettings } from './GallerySettings';
import { makeWidgetTouchView } from '../common/WidgetTouchView';

// Code-split: the management Page only loads when the dashboard navigates
// into it. Widget + Touch stay eager so panel cells render synchronously.
const GalleryPage = lazy(() => import('./page/GalleryPage').then(m => ({ default: m.GalleryPage })));

// Fullscreen always letterboxes (whole photo visible) regardless of the
// tile's cover/fit setting.
function GalleryImmersive(props: WidgetProps) {
  return createElement(GalleryWidget, { ...props, immersive: true });
}

export const galleryApp: AppManifest = {
  meta: {
    type: 'gallery',
    i18nKey: 'panel.widget.gallery',
    icon: ImageIcon,
    // 2x4 kept so the gallery stays available on Q-series single-widget
    // surfaces.
    sizes: ['2x2', '2x4', '4x2', '4x4', '2x2round'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: GalleryWidget,
  Page: GalleryPage,
  // Generic single-cell fullscreen: the lone cell becomes the fill cell, so
  // the viewer (and its fading arrows) spans the whole immersive overlay.
  Touch: makeWidgetTouchView(GalleryImmersive),
  Settings: GallerySettings,
};
