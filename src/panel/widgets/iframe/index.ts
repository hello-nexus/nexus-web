import { Globe } from 'lucide-react';
import type { AppManifest } from '../types';
import { IFrameWidget } from './IFrameWidget';
import { IFrameSettings } from './IFrameSettings';

export const iframeApp: AppManifest = {
  meta: {
    type: 'iframe',
    i18nKey: 'panel.widget.iframe',
    icon: Globe,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: IFrameWidget,
  Settings: IFrameSettings,
};
