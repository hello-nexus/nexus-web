import { Cloud } from 'lucide-react';
import type { AppManifest } from '../types';
import { WeatherWidget } from './WeatherWidget';
import { WeatherPreview } from './WeatherPreview';
import { WeatherSettings } from './WeatherSettings';

export const weatherApp: AppManifest = {
  meta: {
    type: 'weather',
    i18nKey: 'panel.widget.weather',
    icon: Cloud,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: true,
    touch: false,
  },
  Widget: WeatherWidget,
  Preview: WeatherPreview,
  Settings: WeatherSettings,
};
