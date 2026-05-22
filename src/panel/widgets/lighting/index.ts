import { Lightbulb } from 'lucide-react';
import type { AppManifest } from '../types';
import { LightingWidget } from './LightingWidget';
import { LightingPage } from './LightingPage';
import { LightingTouch } from './LightingTouch';

export const lightingApp: AppManifest = {
  meta: {
    type: 'lighting',
    i18nKey: 'panel.widget.lighting',
    icon: Lightbulb,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: false,
    touch: true,
  },
  Widget: LightingWidget,
  Page: LightingPage,
  Touch: LightingTouch,
};
