import { PenLine } from 'lucide-react';
import type { AppManifest } from '../types';
import { WhiteboardWidget } from './WhiteboardWidget';

export const whiteboardApp: AppManifest = {
  meta: {
    type: 'whiteboard',
    i18nKey: 'panel.widget.whiteboard',
    icon: PenLine,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: false,
    touch: true,
  },
  Widget: WhiteboardWidget,
};
