import { RadioTower } from 'lucide-react';
import type { AppManifest } from '../types';
import { ObsWidget } from './ObsWidget';
import { ObsSettings } from './ObsSettings';

export const obsApp: AppManifest = {
  meta: {
    type: 'obs',
    i18nKey: 'panel.widget.obs',
    icon: RadioTower,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
    listed: false,
  },
  Widget: ObsWidget,
  Settings: ObsSettings,
};
