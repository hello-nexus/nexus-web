import type { PanelConfigValue } from '../../types';

export interface HomeAssistantWidgetConfig {
  // HA dashboard id; '' shows the room view.
  dashboard: string;
  // Title captured when the dashboard was picked, so the tile needs no fetch.
  dashboardTitle: string;
  // HaLayoutView.key of a pinned view; '' shows every view as tabs.
  view: string;
}

export function readHomeAssistantConfig(config?: Record<string, PanelConfigValue>): HomeAssistantWidgetConfig {
  const read = (key: string) => (typeof config?.[key] === 'string' ? config[key] as string : '');
  return { dashboard: read('dashboard'), dashboardTitle: read('dashboardTitle'), view: read('view') };
}
