import { PenLine } from 'lucide-react';
import type { AppManifest } from '../types';
import { WhiteboardWidget } from './WhiteboardWidget';
import { WhiteboardTouch } from './WhiteboardTouch';

export const whiteboardApp: AppManifest = {
  meta: {
    type: 'whiteboard',
    i18nKey: 'panel.widget.whiteboard',
    icon: PenLine,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x4',
    // The board is a fit-to-box thumbnail with ink kept in canvas space, so any span works.
    freeform: true,
    // Ink lives in canvas space, so neither orientation loses or reflows a
    // drawing - both get the full board.
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: false,
    // Needs a pointer to draw with, so it is hidden on display-only surfaces.
    touch: true,
    // The tile is a read-only thumbnail; all drawing happens in the fullscreen
    // view, which the desktop surface never opens.
    panelOnly: true,
  },
  Widget: WhiteboardWidget,
  Touch: WhiteboardTouch,
};
