import { lazy } from 'react';
import { Gamepad2 } from 'lucide-react';
import type { AppManifest } from '../types';
import { FramesWidget } from './FramesWidget';

// Code-split: Page only loads when the dashboard navigates into it.
const FramesPage = lazy(() => import('./FramesPage').then(m => ({ default: m.FramesPage })));

// Page-only app: browsing FPS history has no panel-tile shape, so this is
// delisted from the Add Widget catalog (meta.listed: false) the same way
// steamApp is - the desktop app/nav surfaces (sidebar pin, search) resolve
// it from this same manifest via its Page, never its Widget.
export const framesApp: AppManifest = {
  meta: {
    type: 'frames',
    i18nKey: 'panel.widget.frames',
    icon: Gamepad2,
    sizes: ['2x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: false,
    listed: false,
  },
  Widget: FramesWidget,
  Page: FramesPage,
};
