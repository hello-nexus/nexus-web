import { Blocks as BlocksIcon } from 'lucide-react';
import type { AppManifest } from '../types';
import { BlocksWidget } from './BlocksWidget';
import { BlocksTouch } from './BlocksTouch';

export const blocksApp: AppManifest = {
  meta: {
    type: 'blocks',
    i18nKey: 'panel.widget.blocks',
    icon: BlocksIcon,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
    panelOnly: true,
  },
  Widget: BlocksWidget,
  Touch: BlocksTouch,
};
