import { Grid3X3 } from 'lucide-react';
import type { AppManifest } from '../types';
import { BlocksWidget } from './BlocksWidget';

export const blocksApp: AppManifest = {
  meta: {
    type: 'blocks',
    i18nKey: 'panel.widget.blocks',
    icon: Grid3X3,
    sizes: ['1x1', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: BlocksWidget,
};
