import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { gaugeReadings } from '../../../__tests__/panel/visibleText';
import { MonitoringWidget } from './MonitoringWidget';

// The panel app wraps widgets in the same UiSettingsProvider the dashboard
// uses, so useUnitPrefs is the single seam; this proves a rendered widget
// follows it (the provider itself is mocked).
const mockSensors = vi.hoisted(() => ({
  summary: [],
  cpu: [
    { id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 61.6, units: '°C', formatted: '61.6 °C', parent: { id: 'cpu', name: 'CPU' } },
  ],
  gpu: [], memory: [], storage: [], storageComponents: {}, storageSensors: [], motherboard: [],
  motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
}));
const mockWhole = vi.hoisted(() => ({ value: false }));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
  isSmartStorageComponentId: (id: string) => id.startsWith('smart/'),
}));
vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], fanSensors: [], embeddedControllers: [], memoryModules: [] }),
}));
vi.mock('../../../hooks/useFpsSensors', () => ({ useFpsSensors: () => [] }));
vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({ series: [], sampleCount: 60, totalRate: 0, totalRateIn: 0, totalRateOut: 0, entries: [] }),
}));
vi.mock('../../../hooks/useUiSettings', () => ({
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'dot', monitoringWholeNumbers: mockWhole.value }),
}));

const widget: PanelWidget = {
  id: 'monitoring-whole',
  type: 'monitoring',
  size: '2x2',
  col: 0,
  row: 0,
  config: { slotCount: 1, slot0_device: 'cpu', slot0_design: 'bar', slot0_sensor: 'Temperature' } as PanelWidget['config'],
};

describe('MonitoringWidget whole numbers setting', () => {
  afterEach(() => { mockWhole.value = false; });

  it('shows the decimal by default', () => {
    mockWhole.value = false;
    render(<MonitoringWidget widget={widget} />);
    expect(gaugeReadings()).toContain('61.6 °C');
  });

  it('rounds the reading when the setting is on', () => {
    mockWhole.value = true;
    render(<MonitoringWidget widget={widget} />);
    expect(gaugeReadings()).toContain('62 °C');
  });
});
