import { Hammer } from 'lucide-react';
import type { AppManifest } from '../types';
import { BuildWidget } from './BuildWidget';

export const buildApp: AppManifest = {
  meta: {
    type: 'build',
    i18nKey: 'panel.widget.build',
    icon: Hammer,
    sizes: ['2x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: false,
    surfaces: ['desktop'],
    localOnly: true,
    // The tile is hidden from the picker on release builds (the Build page stays); dev-tools builds browse delisted apps regardless.
    listed: false,
  },
  Widget: BuildWidget,
};
