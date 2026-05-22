import { Fan } from 'lucide-react';
import type { AppManifest } from '../types';
import { CoolingWidget } from './CoolingWidget';
import { CoolingPage } from './CoolingPage';

export const coolingApp: AppManifest = {
  meta: {
    type: 'cooling',
    i18nKey: 'panel.widget.cooling',
    icon: Fan,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: false,
  },
  Widget: CoolingWidget,
  Page: CoolingPage,
};
