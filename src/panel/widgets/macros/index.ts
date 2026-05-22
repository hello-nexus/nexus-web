import { Zap } from 'lucide-react';
import type { AppManifest } from '../types';
import { MacrosWidget } from './MacrosWidget';
import { MacrosSettings } from './MacrosSettings';

export const macrosApp: AppManifest = {
  meta: {
    type: 'macros',
    i18nKey: 'panel.widget.macros',
    icon: Zap,
    sizes: ['1x1'],
    defaultSize: '1x1',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: true,
    touch: true,
  },
  Widget: MacrosWidget,
  Settings: MacrosSettings,
};
