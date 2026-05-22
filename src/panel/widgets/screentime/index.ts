import { BarChart } from 'lucide-react';
import type { AppManifest } from '../types';
import { ScreentimeWidget } from './ScreentimeWidget';

export const screentimeApp: AppManifest = {
  meta: {
    type: 'screentime',
    i18nKey: 'panel.widget.screentime',
    icon: BarChart,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: true,
    touch: false,
  },
  Widget: ScreentimeWidget,
};
