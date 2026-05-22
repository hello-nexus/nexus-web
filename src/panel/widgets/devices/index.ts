import { Usb } from 'lucide-react';
import type { AppManifest } from '../types';
import { DevicesWidget } from './DevicesWidget';

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
  // No `Page` — the Devices app is now a pure launcher widget. The
  // existing DevicesPage is still routed (it's the all-devices
  // landing when the user clicks the sidebar's DEVICES header) but
  // it's not surfaced as a sidebar-pinnable app any more. The widget
  // tiles inside each route directly into their own device page.
};
