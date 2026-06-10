import { lazy } from 'react';
import type { AppManifest } from '../types';
import { ScreentimeWidget } from './ScreentimeWidget';
import { ScreenTimeIcon } from './screentimeIcon';

// Code-split: Page only loads when the dashboard navigates into it. Widget
// stays eager so panel cells render synchronously and the panel bundle never
// fetches Page bytes at all.
const ScreentimePage = lazy(() => import('./ScreentimePage').then(m => ({ default: m.ScreentimePage })));

export const screentimeApp: AppManifest = {
  meta: {
    type: 'screentime',
    i18nKey: 'panel.widget.screentime',
    icon: ScreenTimeIcon,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: true,
    touch: false,
  },
  Widget: ScreentimeWidget,
  Page: ScreentimePage,
};
