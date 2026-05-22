import { Monitor } from 'lucide-react';
import type { AppManifest } from '../types';
import { DisplaysWidget } from './DisplaysWidget';

export const displaysApp: AppManifest = {
  meta: {
    type: 'displays',
    i18nKey: 'panel.widget.displays',
    icon: Monitor,
    sizes: ['2x2', '4x2'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: false,
    // Pointer-driven sliders (brightness, contrast) require a pointer.
    touch: true,
  },
  Widget: DisplaysWidget,
};
