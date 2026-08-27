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
    // 4x4 only: the four metric columns plus an icon and a readable name need
    // the full width, and a scrollable list needs the full height.
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    // Not touch-required: scrolling and the sort headers are enhancements, and
    // the default CPU-descending top rows read fine on a pointerless display.
    // (The Q60 is excluded anyway - it locks to 2x4, which this doesn't offer.)
    touch: false,
    defaultConfig: () => ({ refreshSeconds: DEFAULT_REFRESH_SECONDS }),
  },
  // No Preview facet: Widget itself renders PROCESSES_PREVIEW under
  // PanelPreviewProvider, so the catalog tile never touches the live store.
  Widget: ProcessesWidget,
  Touch: ProcessesTouch,
  Settings: ProcessesSettings,
};
