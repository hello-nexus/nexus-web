import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { MonitoringTouch } from './MonitoringTouch';

const mockSensors = {
  summary: [], cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
  storageSensors: [], motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
};

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
}));

vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({
    batteries: [
      { id: 'battery/0', name: 'Test Battery', sensors: [
        { id: 'battery/0/charge', name: 'Charge Level', type: 'Level', value: 80, units: '%', formatted: '80%', parent: { id: 'battery/0', name: 'Test Battery' } },
      ] },
    ],
    nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [],
  }),
}));

vi.mock('../../../hooks/useFpsSensors', () => ({
  useFpsSensors: () => [],
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    series: [], sampleCount: 0, totalRate: 0, totalRateIn: 0, totalRateOut: 0, entries: [],
  }),
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' },
    update: vi.fn(),
    reload: vi.fn(),
  }),
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

function touchWidget(): PanelWidget {
  return {
    id: 'monitoring-touch-1',
    type: 'monitoring',
    size: '4x2',
    col: 0,
    row: 0,
    config: {
      slotCount: 1,
      slot0_device: 'battery',
      slot0_sensor: 'battery/0/charge',
      slot0_design: 'sparkline',
    },
  };
}

describe('MonitoringTouch - extras-backed devices', () => {
  it('resolves an extras-topic sensor (battery) to a live value in immersive view', () => {
    render(<MonitoringTouch widget={touchWidget()} />);

    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });
});
