import { Hourglass } from 'lucide-react';
import type { AppManifest } from '../types';
import { TimerWidget } from './TimerWidget';

export const timerApp: AppManifest = {
  meta: {
    type: 'timer',
    i18nKey: 'panel.widget.timer',
    icon: Hourglass,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: TimerWidget,
};
