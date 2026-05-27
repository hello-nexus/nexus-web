import { lazy } from 'react';
import { Lightbulb } from 'lucide-react';
import type { AppManifest } from '../types';
import { LightingWidget } from './LightingWidget';
import { LightingTouch } from './LightingTouch';
import { AdvancedModeSettings } from '../common/AdvancedModeSettings';

// Code-split: Page only loads when the dashboard navigates into the
// immersive view. Widget + Touch stay eager so panel cells render
// synchronously and the panel bundle never fetches Page bytes at all.
const LightingPage = lazy(() => import('./LightingPage').then(m => ({ default: m.LightingPage })));

export const lightingApp: AppManifest = {
  meta: {
    type: 'lighting',
    i18nKey: 'panel.widget.lighting',
    icon: Lightbulb,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
  },
  Widget: LightingWidget,
  Page: LightingPage,
  Touch: LightingTouch,
  Settings: AdvancedModeSettings,
};
