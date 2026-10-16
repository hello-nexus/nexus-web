import { Globe } from 'lucide-react';
import type { AppManifest } from '../types';
import { WebViewWidget } from './WebViewWidget';
import { WebViewImmersive } from './WebViewImmersive';
import { WebViewSettings } from './WebViewSettings';

export const webViewApp: AppManifest = {
  meta: {
    type: 'web-view',
    i18nKey: 'panel.widget.web-view',
    icon: Globe,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
    // The native layer exists only on the on-device panel hosts.
    panelOnly: true,
    // Surfaces whose host can layer a native view; Q-series and LCD panels cannot.
    surfaces: ['y70', 'monitor'],
  },
  Widget: WebViewWidget,
  Touch: WebViewImmersive,
  Settings: WebViewSettings,
};
