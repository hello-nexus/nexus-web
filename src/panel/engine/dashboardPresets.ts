import type { PanelConfigValue, PanelLayout, PanelWidgetSize } from '../types';
import type { DeviceKey } from '../widgets/monitoring/perfSlots';
import type { GaugeDesignKey } from '../widgets/monitoring/gauges';
import { NETWORK_SENSOR_IN, NETWORK_SENSOR_OUT } from '../widgets/monitoring/networkSensors';
import { createUuid } from '../../lib/uuid';
import { defaultLayoutForDashboard } from './defaultLayout';

export type DashboardPresetId = 'default' | 'monitoring' | 'productivity' | 'gaming';

export interface DashboardPresetWidget {
  type: string;
  size: PanelWidgetSize;
  col: number;
  row: number;
  config?: Record<string, PanelConfigValue>;
}

function monitoringSlots(...slots: Array<[DeviceKey, string, GaugeDesignKey]>): Record<string, PanelConfigValue> {
  const config: Record<string, PanelConfigValue> = { slotCount: slots.length };
  slots.forEach(([device, sensor, design], i) => {
    config[`slot${i}_device`] = device;
    config[`slot${i}_sensor`] = sensor;
    config[`slot${i}_design`] = design;
  });
  return config;
}

// 'default' has no entry: it is the service's install-default desktop layout.
const PRESET_WIDGETS: Record<Exclude<DashboardPresetId, 'default'>, DashboardPresetWidget[]> = {
  monitoring: [
    { type: 'monitoring', size: '4x4', col: 0, row: 0, config: monitoringSlots(
      ['quick', 'summary/cpu-usage', 'sparkline'],
      ['quick', 'summary/cpu-temp', 'arc270'],
      ['quick', 'summary/cpu-clock', 'line'],
      ['quick', 'summary/memory-usage', 'halfgauge'],
    ) },
    { type: 'monitoring', size: '4x4', col: 4, row: 0, config: monitoringSlots(
      ['quick', 'summary/gpu-usage', 'sparkline'],
      ['quick', 'summary/gpu-temp', 'arc270'],
      ['quick', 'summary/vram-usage', 'halfgauge'],
      ['fps', 'FPS', 'line'],
    ) },
    { type: 'processes', size: '4x4', col: 0, row: 4 },
    { type: 'diagnostics', size: '2x2', col: 4, row: 4 },
    { type: 'cooling', size: '2x2', col: 6, row: 4 },
    { type: 'monitoring', size: '4x2', col: 4, row: 6, config: monitoringSlots(
      ['network', NETWORK_SENSOR_IN, 'sparkline'],
      ['network', NETWORK_SENSOR_OUT, 'sparkline'],
    ) },
  ],
  productivity: [
    { type: 'clock', size: '4x2', col: 0, row: 0 },
    { type: 'weather', size: '4x2', col: 4, row: 0 },
    { type: 'calendar', size: '4x4', col: 0, row: 2 },
    { type: 'timer', size: '2x2', col: 4, row: 2 },
    { type: 'stopwatch', size: '2x2', col: 6, row: 2 },
    { type: 'stocks', size: '4x2', col: 4, row: 4 },
    { type: 'screentime', size: '4x2', col: 0, row: 6 },
    { type: 'media', size: '4x2', col: 4, row: 6 },
  ],
  gaming: [
    { type: 'monitoring', size: '4x4', col: 0, row: 0, config: monitoringSlots(
      ['fps', 'FPS', 'sparkline'],
      ['fps', 'Frame Time', 'line'],
      ['quick', 'summary/gpu-temp', 'arc270'],
      ['quick', 'summary/cpu-temp', 'arc270'],
    ) },
    { type: 'media', size: '4x2', col: 4, row: 0 },
    { type: 'lighting', size: '4x2', col: 4, row: 2 },
    { type: 'mixer', size: '4x4', col: 0, row: 4 },
    { type: 'deck', size: '4x2', col: 4, row: 4 },
    { type: 'cooling', size: '2x2', col: 4, row: 6 },
    { type: 'benchmark', size: '2x2', col: 6, row: 6 },
  ],
};

export const DASHBOARD_PRESET_IDS: DashboardPresetId[] = ['default', 'monitoring', 'productivity', 'gaming'];

export function dashboardPresetWidgets(id: DashboardPresetId): DashboardPresetWidget[] {
  if (id === 'default') return defaultLayoutForDashboard().pages[0]?.widgets ?? [];
  return PRESET_WIDGETS[id];
}

export function dashboardPresetLayout(id: DashboardPresetId): PanelLayout {
  if (id === 'default') return defaultLayoutForDashboard();
  return {
    layoutSchemaVersion: 2,
    surface: 'desktop',
    pages: [{
      id: createUuid(),
      widgets: PRESET_WIDGETS[id].map(w => ({ ...w, id: createUuid() })),
    }],
  };
}
