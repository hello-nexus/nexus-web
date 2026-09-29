import { SquareDashed } from 'lucide-react';
import { SINGLE_WIDGET_SURFACE_SIZE, type PanelSurface, type PanelWidgetSize } from '../../types';
import type { AppManifest } from '../types';
import { BlankPreview, BlankWidget } from './BlankWidget';

// Single-widget screens only: an empty slot so a background GIF or shader shows
// unobstructed. Multi-widget panels leave a cell empty by not filling it.
const SURFACES = Object.keys(SINGLE_WIDGET_SURFACE_SIZE) as PanelSurface[];
const SIZES = [...new Set(Object.values(SINGLE_WIDGET_SURFACE_SIZE))] as PanelWidgetSize[];

export const blankApp: AppManifest = {
  meta: {
    type: 'blank',
    i18nKey: 'panel.widget.blank',
    icon: SquareDashed,
    sizes: SIZES,
    defaultSize: SIZES[0],
    surfaces: SURFACES,
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: false,
  },
  Widget: BlankWidget,
  Preview: BlankPreview,
};
