import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { PanelConfigValue, PanelSurface, PanelWidget } from '../../types';
import { MonitoringWidget } from '../monitoring/MonitoringWidget';
import { GAUGE_DESIGN_KEYS, GAUGE_DESIGN_LABELS } from '../monitoring/gauges';
import { MonitoringSettings } from './MonitoringSettings';
import { resolveSensor } from './MonitoringWidget';
import { SENSOR_CATEGORIES } from './sensorCategories';
import { TRYX_SENSOR_GROUPS } from '../../../components/views/DevicePage/tryxOverlayUtils';

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

const mockSensors = {
  summary: [
    { id: 'summary/cpu-temp', name: 'CPU Temperature', type: 'Temperature', value: 45, units: '°C', formatted: '45°C', parent: { id: 'summary', name: 'Quick' } },
    { id: 'summary/cpu-usage', name: 'CPU Usage', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'summary', name: 'Quick' } },
  ],
  cpu: [{ id: 'cpu-total', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'CPU' } }],
  gpu: [{ id: 'gpu-core', name: 'GPU Core', type: 'Load', value: 36, units: '%', formatted: '36%', parent: { id: 'gpu', name: 'GPU' } }],
  memory: [{ id: 'mem-usage', name: 'Memory Usage', type: 'Load', value: 62, units: '%', formatted: '62%', parent: { id: 'mem', name: 'Memory' } }],
  storage: [],
  storageComponents: {
    'smart/nvme/0': {
      id: 'smart/nvme/0', name: 'Test NVMe', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
      sensors: [{ id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature', value: 42, units: '°C', formatted: '42.0 °C', parent: { id: '/nvme/0', name: 'Test NVMe' } }],
    },
  },
  storageSensors: [{ id: 'storage-c', name: 'Drive C', type: 'Load', value: 51, units: '%', formatted: '51%', parent: { id: 'storage', name: 'Storage' } }],
  motherboard: [{ id: 'fan-1', name: 'Fan 1', type: 'Fan', value: 1200, units: 'RPM', formatted: '1200 RPM', parent: { id: 'mobo', name: 'Motherboard' } }],
  motherboardModel: '',
  cpuModel: '',
  gpuModels: [],
  memoryTotal: '',
};

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
  isSmartStorageComponentId: (id: string) => id.startsWith('smart/'),
}));

const mockExtras = {
  batteries: [
    { id: 'battery/0', name: 'Test Battery', sensors: [
      { id: 'battery/0/charge', name: 'Charge Level', type: 'Level', value: 80, units: '%', formatted: '80%', parent: { id: 'battery/0', name: 'Test Battery' } },
    ] },
  ],
  nics: [],
  coolers: [],
  psus: [],
  nvmeStorage: [],
  embeddedControllers: [],
  memoryModules: [
    { id: '/memory/dimm/0', name: 'Test DIMM', sensors: [
      { id: '/memory/dimm/0/temperature/0', name: 'DIMM #0', type: 'Temperature', value: 38, units: '°C', formatted: '38.0 °C', parent: { id: '/memory/dimm/0', name: 'Test DIMM' } },
    ] },
  ],
};

vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => mockExtras,
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

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' },
    update: vi.fn(),
    reload: vi.fn(),
  }),
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
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

function MonitoringEditorHarness({ onUpdate, surface, desktopEditor }: {
  onUpdate: (config: Record<string, PanelConfigValue>) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
}) {
  const [widget, setWidget] = useState(monitoringWidget());
  const [selectedSlot, setSelectedSlot] = useState(0);

  const update = (config: Record<string, PanelConfigValue>) => {
    onUpdate(config);
    setWidget(prev => ({ ...prev, config: { ...prev.config, ...config } }));
  };

  return (
    <>
      <MonitoringWidget widget={widget} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />
      <MonitoringSettings
        widget={widget}
        surface={surface}
        desktopEditor={desktopEditor}
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

describe('MonitoringSettings', () => {
  it('selects the first rendered sensor by default without separate sensor labels', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    expect(screen.getByRole('button', { name: /select cpu total/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /select gpu core/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Selected sensor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sensor 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sensor 2/i)).not.toBeInTheDocument();

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    // 2 slot-select buttons + design buttons + 2 range buttons (sparkline
    // supports scale) + 3 Label chips (Auto/Hide/Custom; reset hidden in Auto)
    expect(screen.getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'))).toHaveLength(2 + GAUGE_DESIGN_KEYS.length + 2 + 3);
  });

  it('updates the selected rendered sensor slot', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /select gpu core/i }));
    expect(screen.getByRole('button', { name: /select gpu core/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'motherboard' } });

    expect(onUpdate).toHaveBeenLastCalledWith({
      slot1_device: 'motherboard',
      slot1_sensor: 'fan-1',
      slot1_min: null,
      slot1_max: null,
    });
  });

  it('supports network rate sensors in monitoring widget slots', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'network' } });

    expect(onUpdate).toHaveBeenLastCalledWith({
      slot0_device: 'network',
      slot0_sensor: 'Network Total',
      slot0_min: null,
      slot0_max: null,
    });
    expect(screen.getByRole('button', { name: /select network total/i })).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(screen.getByText('MB/s')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.sensor' }), { target: { value: 'Network In' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      slot0_sensor: 'Network In',
      slot0_min: null,
      slot0_max: null,
    });
  });

  it('resolves an extras-topic sensor (battery) to a live gauge value', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'battery' } });

    expect(onUpdate).toHaveBeenLastCalledWith({
      slot0_device: 'battery',
      slot0_sensor: 'battery/0/charge',
      slot0_min: null,
      slot0_max: null,
    });
    expect(screen.getByRole('button', { name: /select charge level/i })).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('lists SSD SMART sensors (from a smart/*-keyed storage component) in the picker', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'smart' } });
    const sensorSelect = screen.getByRole('combobox', { name: 'monitoring.settings.sensor' });
    expect(optionLabels(sensorSelect)).toEqual(['Composite Temperature (Temperature)']);
  });

  it('filters sensor choices to the selected category', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' });
    const sensorSelect = screen.getByRole('combobox', { name: 'monitoring.settings.sensor' });

    expect(optionLabels(sensorSelect)).toEqual(['Total (Load)']);

    fireEvent.change(deviceSelect, { target: { value: 'network' } });
    expect(optionLabels(sensorSelect)).toEqual(['Total', 'In', 'Out']);

    fireEvent.change(deviceSelect, { target: { value: 'motherboard' } });
    expect(optionLabels(sensorSelect)).toEqual(['Fan 1 (Fan)']);

    fireEvent.change(deviceSelect, { target: { value: 'storage' } });
    expect(optionLabels(sensorSelect)).toEqual(['Drive C']);
  });

  it('exposes the Tryx-shared categories as a subset in the same order, plus widget-only categories the overlay never sees', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);
    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);

    // Every Tryx-shared category resolves at least one sensor in this
    // fixture, so all of them stay visible, in the same relative order -
    // the two pickers must never disagree on this subset.
    const sharedOnly = values.filter(v => (TRYX_SENSOR_GROUPS as readonly string[]).includes(v));
    expect(sharedOnly).toEqual([...SENSOR_CATEGORIES]);
    expect(sharedOnly).toEqual([...TRYX_SENSOR_GROUPS]);

    // SSD SMART and the extras-topic device groups are widget-only: the
    // Tryx overlay picker never resolves them (see useSensors.storageSensors
    // and useSensorExtras), so offering them there would let a user pick a
    // sensor the service can never find, permanently showing "--".
    const widgetOnlyDevices = ['smart', 'memoryModule', 'battery', 'cooler', 'psu', 'embeddedController'];
    for (const device of widgetOnlyDevices) {
      expect(TRYX_SENSOR_GROUPS as readonly string[]).not.toContain(device);
    }

    // smart/memoryModule/battery resolve sensors in this fixture and stay
    // visible; cooler/psu/embeddedController resolve none and are hidden.
    expect(values).toEqual(expect.arrayContaining(['smart', 'memoryModule', 'battery']));
    expect(values).not.toEqual(expect.arrayContaining(['cooler', 'psu', 'embeddedController']));
  });

  it('migrates a widget saved on the pre-motherboard "fan" device to motherboard, keeping its fan sensor resolvable and not offering "fan" in the picker', () => {
    const updates: Record<string, PanelConfigValue>[] = [];
    function FanWidgetHarness() {
      const [widget, setWidget] = useState<PanelWidget>({
        id: 'monitoring-fan',
        type: 'monitoring',
        size: '4x2',
        col: 0,
        row: 0,
        config: {
          slotCount: 1,
          slot0_device: 'fan',
          slot0_sensor: '',
          slot0_design: 'sparkline',
        },
      });
      return (
        <>
          <MonitoringWidget widget={widget} selectedSlot={0} onSelectSlot={() => {}} />
          <MonitoringSettings
            widget={widget}
            onUpdate={cfg => { updates.push(cfg); setWidget(prev => ({ ...prev, config: { ...prev.config, ...cfg } })); }}
            onResize={vi.fn()}
            selectedSlot={0}
          />
        </>
      );
    }

    render(<FanWidgetHarness />);
    // The legacy 'fan' device is rewritten to motherboard on mount.
    expect(updates).toContainEqual({ slot0_device: 'motherboard' });
    // Its fan sensor stays resolvable under the motherboard set.
    expect(screen.getByRole('button', { name: /select fan 1/i })).toBeInTheDocument();

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).not.toContain('fan');
  });
});

describe('MonitoringSettings - hides empty categories from the picker', () => {
  const savedBatteries = mockExtras.batteries;
  const savedGpu = mockSensors.gpu;

  afterEach(() => {
    mockExtras.batteries = savedBatteries;
    mockSensors.gpu = savedGpu;
  });

  it('hides an extras category with zero sensors (battery) when it is not the active slot device', () => {
    mockExtras.batteries = [];
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).not.toContain('battery');
  });

  it('keeps a populated extras category (memoryModule) in the picker', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).toContain('memoryModule');
  });

  it('keeps fps in the picker regardless of sensor count - it only populates during a live capture', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).toContain('fps');
  });

  it('hides gpu when the box has no GPU sensors and gpu is not the active slot device', () => {
    mockSensors.gpu = [];
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    // Active slot is 0 (cpu); slot 1 (gpu) is not selected, so gpu's
    // now-empty category loses the current-device exception.
    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).not.toContain('gpu');
  });

  it('keeps the active slot device visible even when its category has zero sensors', () => {
    mockExtras.batteries = [];
    function BatteryWidgetHarness() {
      const [widget, setWidget] = useState<PanelWidget>({
        id: 'monitoring-battery',
        type: 'monitoring',
        size: '4x2',
        col: 0,
        row: 0,
        config: {
          slotCount: 1,
          slot0_device: 'battery',
          slot0_sensor: '',
          slot0_design: 'sparkline',
        },
      });
      return (
        <MonitoringSettings
          widget={widget}
          onUpdate={cfg => setWidget(prev => ({ ...prev, config: { ...prev.config, ...cfg } }))}
          onResize={vi.fn()}
          selectedSlot={0}
        />
      );
    }

    render(<BatteryWidgetHarness />);

    const deviceSelect = screen.getByRole('combobox', { name: 'monitoring.settings.device' }) as HTMLSelectElement;
    const values = Array.from(deviceSelect.options).map(o => o.value);
    expect(values).toContain('battery');
  });
});

describe('MonitoringSettings - fixed range fields', () => {
  it('renders only when the active slot is on Fixed scale', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    // Slot 0 (cpu/sparkline, scalable) defaults to Adaptive - no range fields yet.
    expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

    expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' })).toBeInTheDocument();
  });

  it('does not render for a design with no range (Large Value / text)', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /select gpu core/i }));
    fireEvent.click(screen.getByRole('button', { name: GAUGE_DESIGN_LABELS.text }));
    expect(screen.queryByRole('button', { name: 'monitoring.settings.scaleAdaptive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'monitoring.settings.scaleFixed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).not.toBeInTheDocument();
  });

  it('renders the range for a value-fill design (Progress Bar / bar)', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    // slot1 defaults to the bar design (a value-fill gauge).
    fireEvent.click(screen.getByRole('button', { name: /select gpu core/i }));
    expect(screen.getByRole('button', { name: 'monitoring.settings.scaleAdaptive' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    expect(screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).toBeInTheDocument();
  });

  it('seeds the fields from the stored override, defaulting to 0 and the sensor ceiling when unset', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' }) as HTMLInputElement;
    const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' }) as HTMLInputElement;
    expect(minInput.value).toBe('0');
    expect(maxInput.value).toBe('100');
  });

  it('commits slot0_min on blur', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.change(minInput, { target: { value: '20' } });
    fireEvent.blur(minInput);

    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_min: 20 });
  });

  it('commits slot0_max on blur, honoring a value above the sensor default ceiling', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' });
    fireEvent.change(maxInput, { target: { value: '250' } });
    fireEvent.blur(maxInput);

    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_max: 250 });
  });

  it('does not commit on a no-op blur (value unchanged from the seeded default)', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.blur(minInput);

    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ slot0_min: expect.anything() }));
  });

  it('a blank min field commits 0, and a blank max field commits the sensor default ceiling', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.change(minInput, { target: { value: '20' } });
    fireEvent.blur(minInput);
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_min: 20 });

    fireEvent.change(minInput, { target: { value: '' } });
    fireEvent.blur(minInput);
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_min: 0 });

    const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' });
    fireEvent.change(maxInput, { target: { value: '250' } });
    fireEvent.blur(maxInput);
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_max: 250 });

    fireEvent.change(maxInput, { target: { value: '' } });
    fireEvent.blur(maxInput);
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_max: 100 });
  });

  it('flags both fields invalid when the typed range is inverted, matching the render-time fallback', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    // Seeded default max is 100 (fixedDefaultMax); typing a min above it inverts the range.
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.change(minInput, { target: { value: '150' } });
    fireEvent.blur(minInput);

    const maxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' });
    expect(minInput).toHaveAttribute('aria-invalid', 'true');
    expect(maxInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('is hidden on a touch surface with no keyboard and no desktopEditor override; the Adaptive/Fixed toggle stays', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} surface="y70" />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));

    expect(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'monitoring.settings.rangeMax' })).not.toBeInTheDocument();
  });

  it('renders when desktopEditor overrides a touch surface', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} surface="y70" desktopEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.change(minInput, { target: { value: '15' } });
    fireEvent.blur(minInput);

    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_min: 15 });
  });

  it('clears a stale min/max override on a device swap, resetting the fields to the new sensor default', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'monitoring.settings.scaleFixed' }));
    const minInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' });
    fireEvent.change(minInput, { target: { value: '20' } });
    fireEvent.blur(minInput);
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_min: 20 });

    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'motherboard' } });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ slot0_min: null, slot0_max: null }));

    // motherboard's default sensor (Fan 1, dmax 2500) replaces cpu's stale
    // 20 override - the stale number never carries over to the new sensor.
    const resetMinInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMin' }) as HTMLInputElement;
    const resetMaxInput = screen.getByRole('spinbutton', { name: 'monitoring.settings.rangeMax' }) as HTMLInputElement;
    expect(resetMinInput.value).toBe('0');
    expect(resetMaxInput.value).toBe('2500');
  });
});

type SensorMock = typeof mockSensors.cpu[0];

describe('MonitoringSettings - motherboard full sensor set', () => {
  const savedMotherboard = mockSensors.motherboard;

  afterEach(() => {
    mockSensors.motherboard = savedMotherboard;
  });

  it('lists every motherboard sensor type, not just Fan', () => {
    mockSensors.motherboard = [
      { id: 'fan-1', name: 'Fan 1', type: 'Fan', value: 1200, units: 'RPM', formatted: '1200 RPM', parent: { id: 'mobo', name: 'Motherboard' } },
      { id: 'vrm-temp', name: 'VRM Temperature', type: 'Temperature', value: 55, units: 'C', formatted: '55 C', parent: { id: 'mobo', name: 'Motherboard' } },
      { id: 'cpu-vcore', name: 'CPU VCore', type: 'Voltage', value: 1.25, units: 'V', formatted: '1.25 V', parent: { id: 'mobo', name: 'Motherboard' } },
    ] as SensorMock[];

    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'monitoring.settings.device' }), { target: { value: 'motherboard' } });

    const labels = optionLabels(screen.getByRole('combobox', { name: 'monitoring.settings.sensor' }));
    expect(labels).toEqual(['Fan 1 (Fan)', 'VRM Temperature (Temperature)', 'CPU VCore (Voltage)']);
  });
});

describe('MonitoringSettings - id-keyed dedup', () => {
  const savedCpu = mockSensors.cpu;

  afterEach(() => {
    mockSensors.cpu = savedCpu;
  });

  it('lists both same-named sensors as distinct options when types differ', () => {
    mockSensors.cpu = [
      { id: '/intelcpu/0/temperature/9', name: 'P-Core #1', type: 'Temperature', value: 65, units: 'C', formatted: '65 C', parent: { id: 'cpu', name: 'CPU' } },
      { id: '/intelcpu/0/clock/1', name: 'P-Core #1', type: 'Clock', value: 5200, units: 'MHz', formatted: '5200 MHz', parent: { id: 'cpu', name: 'CPU' } },
    ] as SensorMock[];

    render(<MonitoringEditorHarness onUpdate={vi.fn()} />);

    const sensorSelect = screen.getByRole('combobox', { name: 'monitoring.settings.sensor' });
    const labels = optionLabels(sensorSelect);
    expect(labels).toContain('P-Core #1 (Temperature)');
    expect(labels).toContain('P-Core #1 (Clock)');
    expect(labels).toHaveLength(2);
  });
});

describe('resolveSensor - id-keyed lookup', () => {
  const tempSensor = { id: '/intelcpu/0/temperature/9', name: 'P-Core #1', type: 'Temperature', value: 65, units: 'C', formatted: '65 C', parent: { id: 'cpu', name: 'CPU' } };
  const clockSensor = { id: '/intelcpu/0/clock/1', name: 'P-Core #1', type: 'Clock', value: 5200, units: 'MHz', formatted: '5200 MHz', parent: { id: 'cpu', name: 'CPU' } };

  const emptySensors = {
    summary: [],
    cpu: [tempSensor, clockSensor],
    gpu: [],
    memory: [],
    storage: [],
    storageComponents: {},
    storageSensors: [],
    motherboard: [],
    motherboardModel: '',
    cpuModel: '',
    gpuModel: '',
    gpuModels: [],
    gpuComponents: [],
    memoryTotal: '',
  };

  it('resolves the Temperature sensor by id, not the Clock sensor sharing the same name', () => {
    const result = resolveSensor(emptySensors, [], [], 'cpu', '/intelcpu/0/temperature/9');
    expect(result?.id).toBe('/intelcpu/0/temperature/9');
    expect(result?.type).toBe('Temperature');
  });

  it('resolves the Clock sensor by id, not the Temperature sensor sharing the same name', () => {
    const result = resolveSensor(emptySensors, [], [], 'cpu', '/intelcpu/0/clock/1');
    expect(result?.id).toBe('/intelcpu/0/clock/1');
    expect(result?.type).toBe('Clock');
  });

  it('falls back to name lookup for a legacy stored sensor name', () => {
    const sensors = {
      ...emptySensors,
      cpu: [{ id: '/intelcpu/0/load/0', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'CPU' } }],
    };
    const result = resolveSensor(sensors, [], [], 'cpu', 'CPU Total');
    expect(result?.name).toBe('CPU Total');
    expect(result?.id).toBe('/intelcpu/0/load/0');
  });
});

describe('MonitoringWidget - per-slot label modes', () => {
  function widgetWith(config: Record<string, PanelConfigValue>): PanelWidget {
    return {
      id: 'm', type: 'monitoring', size: '4x2', col: 0, row: 0,
      config: {
        slotCount: 2,
        slot0_device: 'cpu', slot0_sensor: 'CPU Total', slot0_design: 'sparkline',
        slot1_device: 'gpu', slot1_sensor: 'GPU Core', slot1_design: 'bar',
        ...config,
      },
    };
  }

  it('custom mode renders the stored label instead of the derived name', () => {
    render(<MonitoringWidget widget={widgetWith({ slot0_labelMode: 'custom', slot0_label: 'My CPU' })} />);
    expect(screen.getByText('My CPU')).toBeInTheDocument();
    expect(screen.queryByText('CPU Total')).not.toBeInTheDocument();
    expect(screen.getByText('GPU Core')).toBeInTheDocument();
  });

  it('hide mode omits the slot label, leaving other slots untouched', () => {
    render(<MonitoringWidget widget={widgetWith({ slot0_labelMode: 'hide' })} />);
    expect(screen.queryByText('CPU Total')).not.toBeInTheDocument();
    expect(screen.getByText('GPU Core')).toBeInTheDocument();
  });

  it('auto mode ignores a remembered custom label (text kept but not shown)', () => {
    render(<MonitoringWidget widget={widgetWith({ slot0_label: 'My CPU' })} />);
    expect(screen.getByText('CPU Total')).toBeInTheDocument();
    expect(screen.queryByText('My CPU')).not.toBeInTheDocument();
  });
});

describe('MonitoringSettings - per-slot Label chip', () => {
  const chip = (name: string) => screen.getByRole('button', { name });
  const AUTO = 'monitoring.settings.labelAuto';
  const HIDE = 'monitoring.settings.labelHide';
  const CUSTOM = 'monitoring.settings.labelCustom';
  const RESET = 'monitoring.settings.resetLabel';
  const FIELD = 'monitoring.settings.customLabel';

  it('defaults to Auto with no reset and no text field', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} desktopEditor />);
    expect(chip(AUTO)).toHaveAttribute('aria-pressed', 'true');
    expect(chip(HIDE)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: RESET })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: FIELD })).not.toBeInTheDocument();
  });

  it('Hide writes labelMode hide', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} desktopEditor />);
    fireEvent.click(chip(HIDE));
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_labelMode: 'hide' });
  });

  it('Custom seeds the field with the derived name and reveals it + reset', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} desktopEditor />);
    fireEvent.click(chip(CUSTOM));
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_labelMode: 'custom', slot0_label: 'CPU Total' });
    expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('CPU Total');
    expect(screen.getByRole('button', { name: RESET })).toBeInTheDocument();
  });

  it('typing updates the label live (per keystroke) and the gauge follows', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} desktopEditor />);
    fireEvent.click(chip(CUSTOM));
    fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_label: 'Hot' });
    expect(screen.getByText('Hot')).toBeInTheDocument();
  });

  it('remembers the custom text across Auto <-> Custom (no re-seed on return)', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} desktopEditor />);
    fireEvent.click(chip(CUSTOM));
    fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });

    fireEvent.click(chip(AUTO));
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_labelMode: null });
    expect(screen.queryByRole('textbox', { name: FIELD })).not.toBeInTheDocument();

    fireEvent.click(chip(CUSTOM));
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_labelMode: 'custom' });
    expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('Hot');
  });

  it('Reset refills the field with the sensor name and stays in Custom', () => {
    const onUpdate = vi.fn();
    render(<MonitoringEditorHarness onUpdate={onUpdate} desktopEditor />);
    fireEvent.click(chip(CUSTOM));
    fireEvent.input(screen.getByRole('textbox', { name: FIELD }), { target: { value: 'Hot' } });

    fireEvent.click(screen.getByRole('button', { name: RESET }));
    expect(onUpdate).toHaveBeenLastCalledWith({ slot0_label: 'CPU Total' });
    expect(chip(CUSTOM)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: FIELD })).toHaveValue('CPU Total');
  });

  it('on a keyboard-less kiosk, chips work but Custom shows a badge instead of the field', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} surface="y70" />);
    fireEvent.click(chip(CUSTOM));
    expect(screen.queryByRole('textbox', { name: FIELD })).not.toBeInTheDocument();
    expect(screen.getByText('common.desktopOnly')).toBeInTheDocument();
  });
});

describe('MicroMonitoringWidget - label / category modes', () => {
  function microWidgetWith(config: Record<string, PanelConfigValue>): PanelWidget {
    return { id: 'mm', type: 'monitoring', size: '4x2', col: 0, row: 0, config: { slotCount: 3, micro_device: 'cpu', ...config } };
  }

  it('custom category caption replaces the derived one', () => {
    render(<MonitoringWidget widget={microWidgetWith({ micro_categoryMode: 'custom', micro_category: 'My Rig' })} />);
    expect(screen.getAllByText('My Rig').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
  });

  it('hidden category drops the caption row, bars still render', () => {
    render(<MonitoringWidget widget={microWidgetWith({ micro_categoryMode: 'hide' })} />);
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
    expect(screen.getAllByText('Total').length).toBeGreaterThanOrEqual(1);
  });

  it('custom per-sensor label applies to a micro bar', () => {
    render(<MonitoringWidget widget={microWidgetWith({ micro_sensor0_labelMode: 'custom', micro_sensor0_label: 'Custom0' })} />);
    expect(screen.getByText('Custom0')).toBeInTheDocument();
  });
});

describe('Label block has no section divider', () => {
  it('the Label block carries data-settings-aside and is a non-first child of the Sensor box', () => {
    render(<MonitoringEditorHarness onUpdate={vi.fn()} desktopEditor />);
    const block = screen.getByRole('button', { name: 'monitoring.settings.labelAuto' })
      .closest('[data-settings-aside="true"]') as HTMLElement;
    expect(block).not.toBeNull();
    const box = block.parentElement as HTMLElement;
    // Sits after the device/sensor selects, so the section hairline would apply
    // to it were it not opted out via data-settings-aside.
    expect(box.children.length).toBeGreaterThan(1);
    expect(box.firstElementChild).not.toBe(block);
  });
});
