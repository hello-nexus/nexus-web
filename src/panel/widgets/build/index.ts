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
    // The page the tile opens is dev-tools only; dev-tools builds browse delisted apps regardless.
    listed: false,
  },
  Widget: BuildWidget,
};
