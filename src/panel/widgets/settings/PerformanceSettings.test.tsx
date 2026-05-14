import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelConfigValue, PanelWidget } from '../../types';
import { PerformanceWidget } from '../performance/PerformanceWidget';
import { GAUGE_DESIGN_KEYS } from '../performance/gauges';
import { PerformanceSettings } from './PerformanceSettings';

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => ({
    cpu: [{ id: 'cpu-total', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'CPU' } }],
    gpu: [{ id: 'gpu-core', name: 'GPU Core', type: 'Load', value: 36, units: '%', formatted: '36%', parent: { id: 'gpu', name: 'GPU' } }],
    memory: [{ id: 'mem-usage', name: 'Memory Usage', type: 'Load', value: 62, units: '%', formatted: '62%', parent: { id: 'mem', name: 'Memory' } }],
    storage: [],
    storageComponents: {},
    storageSensors: [{ id: 'storage-c', name: 'Drive C', type: 'Load', value: 51, units: '%', formatted: '51%', parent: { id: 'storage', name: 'Storage' } }],
    motherboard: [{ id: 'fan-1', name: 'Fan 1', type: 'Fan', value: 1200, units: 'RPM', formatted: '1200 RPM', parent: { id: 'mobo', name: 'Motherboard' } }],
    motherboardModel: '',
    cpuModel: '',
    gpuModels: [],
    memoryTotal: '',
  }),
}));

vi.mock('../../../hooks/useFpsSensors', () => ({
  useFpsSensors: () => [],
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    series: [],
    sampleCount: 60,
    totalRate: 1_572_864,
    totalRateIn: 1_048_576,
    totalRateOut: 524_288,
    entries: [],
  }),
}));

function monitoringWidget(): PanelWidget {
  return {
    id: 'monitoring-1',
    type: 'monitoring',
    size: '4x2',
    col: 0,
    row: 0,
    config: {
      slotCount: 2,
      slot0_device: 'cpu',
      slot0_sensor: 'CPU Total',
      slot0_design: 'sparkline',
      slot1_device: 'gpu',
      slot1_sensor: 'GPU Core',
      slot1_design: 'bar',
    },
  };
}

function MonitoringEditorHarness({ onUpdate }: { onUpdate: (config: Record<string, PanelConfigValue>) => void }) {
  const [widget, setWidget] = useState(monitoringWidget());
  const [selectedSlot, setSelectedSlot] = useState(0);

  const update = (config: Record<string, PanelConfigValue>) => {
    onUpdate(config);
    setWidget(prev => ({ ...prev, config: { ...prev.config, ...config } }));
  };

  return (
    <>
      <PerformanceWidget widget={widget} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />
      <PerformanceSettings
        widget={widget}
        onUpdate={update}
        onResize={vi.fn()}
        selectedSlot={selectedSlot}
        onSelectedSlotChange={setSelectedSlot}
      />
    </>
  );
}

function optionLabels(select: HTMLElement): string[] {
  return Array.from((select as HTMLSelectElement).options).map(option => option.textContent ?? '');
}

describe('PerformanceSettings', () => {
  it('selects the first rendered sensor by default without separate sensor labels', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    expect(screen.getByRole('button', { name: /select cpu total/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /select gpu core/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Selected sensor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sensor 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sensor 2/i)).not.toBeInTheDocument();

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    // 2 slot-select buttons + design buttons + 2 range buttons (sparkline supports scale)
    expect(screen.getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'))).toHaveLength(2 + GAUGE_DESIGN_KEYS.length + 2);
  });

  it('updates the selected rendered sensor slot', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /select gpu core/i }));
    expect(screen.getByRole('button', { name: /select gpu core/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('combobox', { name: 'Device' }), { target: { value: 'fan' } });

    expect(onUpdate).toHaveBeenLastCalledWith({
      slot1_device: 'fan',
      slot1_sensor: 'Fan 1',
    });
  });

  it('supports network rate sensors in monitoring widget slots', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Device' }), { target: { value: 'network' } });

    expect(onUpdate).toHaveBeenLastCalledWith({
      slot0_device: 'network',
      slot0_sensor: 'Network Total',
    });
    expect(screen.getByRole('button', { name: /select network total/i })).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(screen.getByText('MB/s')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Sensor' }), { target: { value: 'Network In' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      slot0_sensor: 'Network In',
    });
  });

  it('filters sensor choices to the selected category', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'Device' });
    const sensorSelect = screen.getByRole('combobox', { name: 'Sensor' });

    expect(optionLabels(sensorSelect)).toEqual(['Total (Load)']);

    fireEvent.change(deviceSelect, { target: { value: 'network' } });
    expect(optionLabels(sensorSelect)).toEqual(['Total', 'In', 'Out']);

    fireEvent.change(deviceSelect, { target: { value: 'fan' } });
    expect(optionLabels(sensorSelect)).toEqual(['Fan 1']);
  });
});
