import { Watch } from 'lucide-react';
import type { AppManifest } from '../types';
import { StopwatchWidget } from './StopwatchWidget';

export const stopwatchApp: AppManifest = {
  meta: {
    type: 'stopwatch',
    i18nKey: 'panel.widget.stopwatch',
    icon: Watch,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: StopwatchWidget,
};
