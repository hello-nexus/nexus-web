import { Usb } from 'lucide-react';
import type { AppManifest } from '../types';
import { DevicesWidget } from './DevicesWidget';
import { DevicesPage } from './DevicesPage';

export const devicesApp: AppManifest = {
  meta: {
    type: 'devices',
    i18nKey: 'panel.widget.devices',
    icon: Usb,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    // Pager arrows + per-device tap-through controls need a pointer
    // (touch or mouse). Display-only surfaces (q60) get this excluded
    // by widgetAvailableForSurface.
    touch: true,
  },
  Widget: DevicesWidget,
  Page: DevicesPage,
};
