import { lazy } from 'react';
import { LampCeiling } from 'lucide-react';
import type { AppManifest } from '../types';
import { SmartLightsWidget } from './SmartLightsWidget';
import { SmartLightsTouch } from './SmartLightsTouch';

// Code-split: the management Page only loads when the dashboard navigates
// into it. Widget + Touch stay eager so the panel grid renders synchronously.
const SmartLightsPage = lazy(() => import('./SmartLightsPage').then(m => ({ default: m.SmartLightsPage })));

export const smartLightsApp: AppManifest = {
  meta: {
    type: 'smart-lights',
    i18nKey: 'panel.widget.smart-lights',
    icon: LampCeiling,
    sizes: ['2x2', '4x2'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: false,
    touch: true,
  },
  Widget: SmartLightsWidget,
  Page: SmartLightsPage,
  Touch: SmartLightsTouch,
};
