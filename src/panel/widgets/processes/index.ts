import { ListTree } from 'lucide-react';
import type { AppManifest } from '../types';
import { ProcessesWidget } from './ProcessesWidget';
import { ProcessesTouch } from './ProcessesTouch';
import { ProcessesSettings } from './ProcessesSettings';
import { DEFAULT_REFRESH_SECONDS } from './processesData';

export const processesApp: AppManifest = {
  meta: {
    type: 'processes',
    i18nKey: 'panel.widget.processes',
    icon: ListTree,
    // Full-width only: the four metric columns plus an icon and a readable
    // name need it. 4x2 is the same tile with fewer rows - the tile slices to
    // whatever fits whole (useRowsMetrics), so the half height needs no
    // layout of its own.
    sizes: ['4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    // Not touch-required: scrolling and the sort headers are enhancements, and
    // the default CPU-descending top rows read fine on a pointerless display -
    // which, with 4x2 offered, is the lcd-wide cooler glass. (The Q60 locks to
    // 2x4, which this doesn't offer.)
    touch: false,
    defaultConfig: () => ({ refreshSeconds: DEFAULT_REFRESH_SECONDS }),
    // A header press writes the sort straight from the tile, on the device as
    // well as in the editor.
    persistsFromTile: true,
  },
  // No Preview facet: Widget itself renders PROCESSES_PREVIEW under
  // PanelPreviewProvider, so the catalog tile never touches the live store.
  Widget: ProcessesWidget,
  Touch: ProcessesTouch,
  Settings: ProcessesSettings,
};
