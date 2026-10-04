import { lazy } from 'react';
import { House } from 'lucide-react';
import type { AppManifest } from '../types';
import { HomeAssistantWidget } from './HomeAssistantWidget';
import { HomeAssistantTouch } from './HomeAssistantTouch';
import { HomeAssistantSettings } from './HomeAssistantSettings';

const HomeAssistantPage = lazy(() => import('./HomeAssistantPage').then(m => ({ default: m.HomeAssistantPage })));

export const homeAssistantApp: AppManifest = {
  meta: {
    type: 'home-assistant',
    i18nKey: 'panel.widget.home-assistant',
    icon: House,
    sizes: ['2x2', '4x2'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
  },
  Widget: HomeAssistantWidget,
  Page: HomeAssistantPage,
  Touch: HomeAssistantTouch,
  Settings: HomeAssistantSettings,
};
