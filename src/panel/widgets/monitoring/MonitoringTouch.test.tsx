import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { gaugeReadings } from '../../../__tests__/panel/visibleText';
import type { PanelWidget } from '../../types';
import { immersiveEntries, MonitoringTouch } from './MonitoringTouch';

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

    expect(gaugeReadings()).toContain('80%');
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });
});

function slotWidget(id: string, sensors: string[], extra: PanelWidget['config'] = {}): PanelWidget {
  const config: NonNullable<PanelWidget['config']> = { slotCount: sensors.length, ...extra };
  sensors.forEach((sensor, i) => {
    config[`slot${i}_device`] = 'quick';
    config[`slot${i}_sensor`] = sensor;
  });
  return { id, type: 'monitoring', size: '4x2', col: 0, row: 0, config };
}

describe('immersiveEntries', () => {
  it('puts the opened widget first, then the page siblings in page order', () => {
    const a = slotWidget('a', ['summary/cpu-usage', 'summary/gpu-usage']);
    const b = slotWidget('b', ['summary/cpu-temp']);
    const clock: PanelWidget = { id: 'c', type: 'clock', size: '2x2', col: 0, row: 0 };
    const sensors = immersiveEntries(b, [a, clock, b])
      .map(e => (e.kind === 'slot' ? e.slot.sensorName : e.widget.id));
    expect(sensors).toEqual(['summary/cpu-temp', 'summary/cpu-usage', 'summary/gpu-usage']);
  });

  it('gives a sensor shown twice one cell, keeping the opened widget design', () => {
    const opened = slotWidget('a', ['summary/cpu-usage'], { slot0_design: 'text' });
    const sibling = slotWidget('b', ['summary/cpu-usage', 'summary/gpu-temp'], { slot0_design: 'sparkline' });
    const entries = immersiveEntries(opened, [sibling, opened]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'slot', slot: { sensorName: 'summary/cpu-usage', design: 'text' } });
  });

  it('keeps a Micro widget as one cell', () => {
    const opened = slotWidget('a', ['summary/cpu-usage']);
    const micro: PanelWidget = { id: 'm', type: 'monitoring', size: '2x2', col: 0, row: 0, config: { slotCount: 3, micro_device: 'gpu' } };
    const entries = immersiveEntries(opened, [opened, micro]);
    expect(entries.map(e => e.kind)).toEqual(['slot', 'micro']);
    expect(entries[1]).toMatchObject({ kind: 'micro', count: 3, devices: ['gpu', 'gpu', 'gpu'] });
  });

  it('shows only the opened widget without page context', () => {
    expect(immersiveEntries(slotWidget('a', ['summary/cpu-usage', 'summary/cpu-temp']), undefined)).toHaveLength(2);
  });
});
