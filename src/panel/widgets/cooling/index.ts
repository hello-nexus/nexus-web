import { lazy } from 'react';
import { Fan } from 'lucide-react';
import type { AppManifest } from '../types';
import { CoolingWidget } from './CoolingWidget';
import { CoolingTouch } from './CoolingTouch';
import { AdvancedModeSettings } from '../common/AdvancedModeSettings';

// Code-split: Page only loads when the dashboard navigates into the
// immersive view. Widget + Touch stay eager so panel cells render
// synchronously and the panel bundle never fetches Page bytes at all.
const CoolingPage = lazy(() => import('./CoolingPage').then(m => ({ default: m.CoolingPage })));

export const coolingApp: AppManifest = {
  meta: {
    type: 'cooling',
    i18nKey: 'panel.widget.cooling',
    icon: Fan,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: true,
    touch: true,
  },
  Widget: CoolingWidget,
  Page: CoolingPage,
  Touch: CoolingTouch,
  Settings: AdvancedModeSettings,
};
