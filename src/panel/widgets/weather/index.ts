import { lazy } from 'react';
import { CloudSun } from 'lucide-react';
import type { AppManifest } from '../types';
import { WeatherWidget } from './WeatherWidget';
import { WeatherPreview } from './WeatherPreview';
import { WeatherSettings } from './WeatherSettings';
import { WeatherTouch } from './WeatherTouch';

// Page is code-split like the clock's; Widget + Touch stay eager so panel
// cells render synchronously.
const WeatherPage = lazy(() => import('./WeatherPage').then(m => ({ default: m.WeatherPage })));

export const weatherApp: AppManifest = {
  meta: {
    type: 'weather',
    i18nKey: 'panel.widget.weather',
    icon: CloudSun,
    sizes: ['2x2', '2x4', '4x2', '4x4', '2x2round'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: WeatherWidget,
  Preview: WeatherPreview,
  Page: WeatherPage,
  Touch: WeatherTouch,
  Settings: WeatherSettings,
};
