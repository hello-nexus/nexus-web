import { Hammer } from 'lucide-react';
import type { AppManifest } from '../types';
import { DEV_TOOLS } from '../../../lib/devTools';
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
    // The page the tile opens is dev-tools only, so the picker offers the tile only there.
    listed: DEV_TOOLS,
  },
  Widget: BuildWidget,
};
