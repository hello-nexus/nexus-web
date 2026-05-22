import { Fish } from 'lucide-react';
import type { AppManifest } from '../types';
import { AquariumWidget } from './AquariumWidget';

export const aquariumApp: AppManifest = {
  meta: {
    type: 'aquarium',
    i18nKey: 'panel.widget.aquarium',
    icon: Fish,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: AquariumWidget,
};
