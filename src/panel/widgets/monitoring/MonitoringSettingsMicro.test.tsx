import { useState } from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { PanelConfigValue, PanelWidget } from '../../types';
import { MonitoringSettings } from './MonitoringSettings';

// Drive the dropdown as a native <select> here: these tests exercise the
// widget's sensor wiring, not the custom Select's open/close mechanics (those
// live in Select.test.tsx).
vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, children, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean }[]; children?: React.ReactNode;
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options ? options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>) : children}
    </select>
  ),
}));

// Mock with enough CPU + GPU sensors that Micro at 4 rows has real choices,
// and one device (memory) intentionally short of MICRO_MAX_COUNT so the
// disabled-eligibility branch is exercised. `summary` is mutable so a single
// test can populate it to exercise the Quick-first eligibility fallback.
const mockSensors = vi.hoisted(() => ({
  summary: [] as Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>,
  cpu: [
    { id: 'cpu-total', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'AMD Ryzen 7 9800X3D' } },
    { id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 68, units: 'C', formatted: '68 C', parent: { id: 'cpu', name: 'AMD Ryzen 7 9800X3D' } },
    { id: 'cpu-pwr', name: 'CPU Power', type: 'Power', value: 92, units: 'W', formatted: '92 W', parent: { id: 'cpu', name: 'AMD Ryzen 7 9800X3D' } },
    { id: 'cpu-clk', name: 'CPU Clock', type: 'Clock', value: 4500, units: 'MHz', formatted: '4500 MHz', parent: { id: 'cpu', name: 'AMD Ryzen 7 9800X3D' } },
  ],
  gpu: [
    { id: 'gpu-load', name: 'GPU Core', type: 'Load', value: 55, units: '%', formatted: '55%', parent: { id: 'gpu', name: 'NVIDIA RTX 5080' } },
    { id: 'gpu-temp', name: 'GPU Hotspot', type: 'Temperature', value: 72, units: 'C', formatted: '72 C', parent: { id: 'gpu', name: 'NVIDIA RTX 5080' } },
    { id: 'gpu-mem', name: 'GPU Memory', type: 'Load', value: 60, units: '%', formatted: '60%', parent: { id: 'gpu', name: 'NVIDIA RTX 5080' } },
    { id: 'gpu-pwr', name: 'GPU Power', type: 'Power', value: 230, units: 'W', formatted: '230 W', parent: { id: 'gpu', name: 'NVIDIA RTX 5080' } },
  ],
  memory: [
    { id: 'mem-usage', name: 'Memory Usage', type: 'Load', value: 62, units: '%', formatted: '62%', parent: { id: 'mem', name: 'Memory' } },
  ],
  storage: [],
  storageComponents: {},
  storageSensors: [],
  motherboard: [],
  motherboardModel: '',
  cpuModel: 'AMD Ryzen 7 9800X3D',
  gpuModels: ['NVIDIA RTX 5080'],
  memoryTotal: '32 GB',
}));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
}));

vi.mock('../../../hooks/useFpsSensors', () => ({
  useFpsSensors: () => [],
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    series: [],
    sampleCount: 60,
    totalRate: 0,
    totalRateIn: 0,
    totalRateOut: 0,
    entries: [],
  }),
}));

function microWidget(initialCount: number): PanelWidget {
  return {
    id: 'monitoring-micro',
    type: 'monitoring',
    size: '4x2',
    col: 0,
    row: 0,
    config: {
      slotCount: initialCount,
      // Pre-existing multi-sensor config that must NOT be touched by Micro.
      slot0_device: 'gpu',
      slot0_sensor: 'GPU Core',
      slot0_design: 'sparkline',
      slot1_device: 'memory',
      slot1_sensor: 'Memory Usage',
      slot1_design: 'caterpillar',
    },
  };
}

function MicroHarness({ initial, onUpdate }: { initial: PanelWidget; onUpdate?: (cfg: Record<string, PanelConfigValue>) => void }) {
  const [widget, setWidget] = useState(initial);
  const update = (cfg: Record<string, PanelConfigValue>) => {
    onUpdate?.(cfg);
    setWidget(prev => ({ ...prev, config: { ...prev.config, ...cfg } }));
  };
  return <MonitoringSettings widget={widget} onUpdate={update} onResize={vi.fn()} />;
}

function mergedPatch(updates: Record<string, PanelConfigValue>[]): Record<string, PanelConfigValue> {
  return Object.assign({}, ...updates);
}

describe('MonitoringSettings - Micro mode', () => {
  it('initializes Micro keyspace from scratch when count flips to 3 (multi keys untouched)', () => {
    const updates: Record<string, PanelConfigValue>[] = [];
    render(<MicroHarness initial={microWidget(3)} onUpdate={cfg => updates.push(cfg)} />);

    const merged = mergedPatch(updates);
    expect(merged.micro_device).toBe('cpu');
    expect(merged.micro_sensor0).toBeTruthy();
    expect(merged.micro_sensor1).toBeTruthy();
    expect(merged.micro_sensor2).toBeTruthy();
    // The pre-existing multi-sensor config must not have been overwritten.
    expect(merged.slot0_device).toBeUndefined();
    expect(merged.slot1_design).toBeUndefined();
  });

  it('initializes 4 sensor slots when count flips to 4', () => {
    const updates: Record<string, PanelConfigValue>[] = [];
    render(<MicroHarness initial={microWidget(4)} onUpdate={cfg => updates.push(cfg)} />);

    const merged = mergedPatch(updates);
    expect(merged.micro_sensor0).toBeTruthy();
    expect(merged.micro_sensor1).toBeTruthy();
    expect(merged.micro_sensor2).toBeTruthy();
    expect(merged.micro_sensor3).toBeTruthy();
  });

  it('changing the device writes micro_device + reset micro_sensorN; multi keys remain untouched', () => {
    const updates: Record<string, PanelConfigValue>[] = [];
    render(<MicroHarness initial={microWidget(4)} onUpdate={cfg => updates.push(cfg)} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' });
    act(() => {
      fireEvent.change(deviceSelect, { target: { value: 'gpu' } });
    });

    const last = updates[updates.length - 1];
    expect(last.micro_device).toBe('gpu');
    expect(last.micro_sensor0).toBe('gpu-load');
    expect(last.micro_sensor1).toBe('gpu-temp');
    expect(last.micro_sensor2).toBe('gpu-mem');
    expect(last.micro_sensor3).toBe('gpu-pwr');
    // Multi-sensor keys must not be touched by the device-change handler.
    expect(last.slot0_device).toBeUndefined();
    expect(last.slot1_design).toBeUndefined();
  });

  it('disables device options that cannot fill the active slot count', () => {
    render(<MicroHarness initial={microWidget(3)} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const optionByValue = (value: string) =>
      Array.from(deviceSelect.options).find(o => o.value === value)!;

    // At count=3: CPU (4), GPU (4), Network (3 - Total/In/Out) all clear the bar.
    expect(optionByValue('cpu').disabled).toBe(false);
    expect(optionByValue('gpu').disabled).toBe(false);
    expect(optionByValue('network').disabled).toBe(false);
    // memory (1) and fps (1) do not have enough sensors.
    expect(optionByValue('memory').disabled).toBe(true);
    expect(optionByValue('fps').disabled).toBe(true);
    // No motherboard sensors in this fixture.
    expect(optionByValue('motherboard').disabled).toBe(true);
    // No summary sensors in this fixture.
    expect(optionByValue('quick').disabled).toBe(true);
  });

  it('hides Network from the picker at count=4 (only 3 distinct network sensors exist)', () => {
    render(<MicroHarness initial={microWidget(4)} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const optionByValue = (value: string) =>
      Array.from(deviceSelect.options).find(o => o.value === value)!;

    expect(optionByValue('cpu').disabled).toBe(false);
    expect(optionByValue('gpu').disabled).toBe(false);
    expect(optionByValue('network').disabled).toBe(true);
  });

  it('renders count sensor selects (3 for count=3) with no Design grid', () => {
    render(<MicroHarness initial={microWidget(3)} />);
    expect(screen.getByRole('combobox', { name: 'Sensor 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sensor 3' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sensor 4' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Design/i)).not.toBeInTheDocument();
  });

  it('renders 4 sensor selects when count=4', () => {
    render(<MicroHarness initial={microWidget(4)} />);
    expect(screen.getByRole('combobox', { name: 'Sensor 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sensor 4' })).toBeInTheDocument();
  });
});

describe('MonitoringSettings - Micro mode with summary sensors present', () => {
  const savedSummary = mockSensors.summary;

  afterEach(() => {
    mockSensors.summary = savedSummary;
  });

  it('reassigns a now-ineligible stored micro_device to Quick, first in DEVICE_OPTIONS order, instead of CPU', () => {
    mockSensors.summary = [
      { id: 'summary/cpu-temp', name: 'CPU Temperature', type: 'Temperature', value: 45, units: '°C', formatted: '45°C', parent: { id: 'summary', name: 'Quick' } },
      { id: 'summary/cpu-usage', name: 'CPU Usage', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'summary', name: 'Quick' } },
      { id: 'summary/gpu-temp', name: 'GPU Temperature', type: 'Temperature', value: 60, units: '°C', formatted: '60°C', parent: { id: 'summary', name: 'Quick' } },
      { id: 'summary/gpu-usage', name: 'GPU Usage', type: 'Load', value: 55, units: '%', formatted: '55%', parent: { id: 'summary', name: 'Quick' } },
      { id: 'summary/memory-usage', name: 'Memory Usage', type: 'Load', value: 62, units: '%', formatted: '62%', parent: { id: 'summary', name: 'Quick' } },
    ];

    // Stored on 'network' (only 3 distinct sensors), which count=4 makes
    // ineligible - the normalization patch must reassign micro_device.
    const widget: PanelWidget = {
      id: 'monitoring-micro-network',
      type: 'monitoring',
      size: '4x2',
      col: 0,
      row: 0,
      config: { slotCount: 4, micro_device: 'network' },
    };

    const updates: Record<string, PanelConfigValue>[] = [];
    render(<MicroHarness initial={widget} onUpdate={cfg => updates.push(cfg)} />);

    expect(mergedPatch(updates).micro_device).toBe('quick');
  });
});
