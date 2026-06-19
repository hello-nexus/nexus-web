import { MonitorUp } from 'lucide-react';
import type { AppManifest } from '../types';
import { TransferWidget } from './TransferWidget';

export const transferApp: AppManifest = {
  meta: {
    type: 'transfer',
    i18nKey: 'panel.widget.transfer',
    icon: MonitorUp,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: true,
    // Sends the phone's photos/clipboard to the host PC - meaningless on the
    // PC's own panel surfaces.
    remoteOnly: true,
  },
  Widget: TransferWidget,
};
