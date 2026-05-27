import { lazy } from 'react';
import { Clock } from 'lucide-react';
import type { AppManifest } from '../types';
import { ClockWidget } from './ClockWidget';
import { ClockSettings } from './ClockSettings';
import { makeWidgetTouchView } from '../common/WidgetTouchView';

// Code-split: Page only loads when the dashboard navigates into the
// immersive view. Widget + Touch stay eager so panel cells render
// synchronously and the panel bundle never fetches Page bytes at all.
const ClockPage = lazy(() => import('./ClockPage').then(m => ({ default: m.ClockPage })));

export const clockApp: AppManifest = {
  meta: {
    type: 'clock',
    i18nKey: 'panel.widget.clock',
    icon: Clock,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: ClockWidget,
  Page: ClockPage,
  Touch: makeWidgetTouchView(ClockWidget),
  Settings: ClockSettings,
};
