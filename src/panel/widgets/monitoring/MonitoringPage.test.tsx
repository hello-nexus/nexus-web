import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonitoringPage } from './MonitoringPage';

vi.mock('../../../hooks/useMonitoringFrame', () => ({
  useMonitoringFrame: () => null,
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    entries: [],
    totalIn: 0,
    totalOut: 0,
    historyIn: [],
    historyOut: [],
  }),
}));

vi.mock('../../../hooks/useProcessMonitor', () => ({
  useProcessMonitor: () => ({
    cpuSeries: [],
    memSeries: [],
    sampleCount: 0,
    totalCpu: 0,
    totalMemMb: 0,
  }),
  useGpuProcessFeed: () => {},
}));

const sensorState = {
  summary: [] as Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>,
  cpu: [
    { id: 'cpu/load', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'cpu' } },
  ],
  gpu: [] as Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>,
  gpuComponents: [],
  memory: [],
  storage: [],
  storageComponents: {},
  storageSensors: [],
  motherboard: [],
  motherboardModel: '',
  cpuModel: 'test cpu',
  gpuModels: [],
  memoryTotal: '',
};

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => sensorState,
}));

type ExtrasComponentMock = {
  id: string;
  name: string;
  sensors: Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>;
};

const extrasState = {
  batteries: [
    { id: 'battery/0', name: 'Test Battery', sensors: [
      { id: 'battery/0/charge', name: 'Charge Level', type: 'Level', value: 80, units: '%', formatted: '80%', parent: { id: 'battery/0', name: 'Test Battery' } },
    ] },
  ] as ExtrasComponentMock[],
  nics: [] as ExtrasComponentMock[],
  coolers: [] as ExtrasComponentMock[],
  psus: [] as ExtrasComponentMock[],
  nvmeStorage: [] as ExtrasComponentMock[],
  embeddedControllers: [] as ExtrasComponentMock[],
  memoryModules: [
    { id: '/memory/dimm/0', name: 'Corsair - CMK16GX4M2B3200C16 (#0)', sensors: [
      { id: '/memory/dimm/0/temperature/0', name: 'DIMM #0', type: 'Temperature', value: 38, units: '°C', formatted: '38.0 °C', parent: { id: '/memory/dimm/0', name: 'Corsair - CMK16GX4M2B3200C16 (#0)' } },
    ] },
  ] as ExtrasComponentMock[],
};

vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => extrasState,
}));

const updateMock = vi.fn();
let collapsedState: string[] = [];
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { monitoringShowAverage: false, monitoringDetailedCollapsed: collapsedState },
    update: (patch: { monitoringDetailedCollapsed?: string[] }) => {
      if (patch.monitoringDetailedCollapsed) collapsedState = patch.monitoringDetailedCollapsed;
      updateMock(patch);
    },
  }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../lib/monitoringStore', () => ({
  getOverviewHist: () => ({
    cpu: [],
    gpu: [],
    mem: [],
    netDown: [],
    netUp: [],
  }),
  getGpuHist: () => [],
  colorFor: () => '#888',
}));

describe('MonitoringPage', () => {
  it('defaults to overview without forcing a route tab write', () => {
    const onTabChange = vi.fn();
    render(
      <MonitoringPage
        serviceOnline={false}
        connectionState="offline"
        tab={null}
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'monitoring.tab.overview' })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps invalid url tabs render-only instead of normalizing history', () => {
    const onTabChange = vi.fn();
    render(
      <MonitoringPage
        serviceOnline={false}
        connectionState="offline"
        tab="not-a-real-tab"
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'monitoring.tab.overview' })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('renders Detailed tab sections, hides empty families, and toggles on header click', () => {
    collapsedState = [];
    updateMock.mockClear();

    render(
      <MonitoringPage
        serviceOnline={true}
        connectionState="online"
        tab="detailed"
        onTabChange={vi.fn()}
      />,
    );

    // Sensor row from the CPU section body proves the body is rendered while
    // the section is expanded.
    expect(screen.getByText('CPU Total')).toBeInTheDocument();

    // Each section header is one button labelled by its title text.
    const cpuHeader = screen.getByRole('button', { name: /monitoring\.detailed\.cpu/i });
    expect(cpuHeader).toHaveAttribute('aria-expanded', 'true');

    // Battery section also visible because the extras mock has one battery.
    expect(screen.getByRole('button', { name: /monitoring\.detailed\.battery/i })).toBeInTheDocument();

    // DIMM section also visible because the extras mock has one memory module,
    // and its temperature sensor renders in the section body.
    expect(screen.getByRole('button', { name: /monitoring\.detailed\.memoryModule/i })).toBeInTheDocument();
    expect(screen.getByText('DIMM #0')).toBeInTheDocument();

    // GPU has zero sensors and zero extras-equivalents -- the section must not render.
    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.gpu/i })).toBeNull();

    // PSU/cooler/EC extras mocks are all empty arrays -- none of their
    // sections may render (the families this task is guarding against).
    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.psu/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.cooler/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.ec/i })).toBeNull();

    // Click toggles collapse and persists the section id through useUiSettings.
    fireEvent.click(cpuHeader);
    expect(updateMock).toHaveBeenCalledWith({ monitoringDetailedCollapsed: ['cpu'] });
  });

  it('nests a collapsible sensor-type group inside each family section', () => {
    collapsedState = [];
    updateMock.mockClear();

    render(
      <MonitoringPage
        serviceOnline={true}
        connectionState="online"
        tab="detailed"
        onTabChange={vi.fn()}
      />,
    );

    // The CPU family's one sensor is type "Load" -- its nested group header
    // renders as its own toggle button, expanded by default.
    const cpuLoadGroup = screen.getByRole('button', { name: /^Load$/ });
    expect(cpuLoadGroup).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('CPU Total')).toBeInTheDocument();

    // Toggling the group persists the composite family/group id, independent
    // of the family's own id.
    fireEvent.click(cpuLoadGroup);
    expect(updateMock).toHaveBeenCalledWith({ monitoringDetailedCollapsed: ['cpu/Load'] });
  });

  it('hides a collapsed group\'s rows without collapsing its family section', () => {
    collapsedState = ['cpu/Load'];

    render(
      <MonitoringPage
        serviceOnline={true}
        connectionState="online"
        tab="detailed"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^Load$/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('CPU Total')).toBeNull();
    // The family header stays expanded -- a collapsed nested group must not
    // collapse the section it lives in.
    expect(screen.getByRole('button', { name: /monitoring\.detailed\.cpu/i })).toHaveAttribute('aria-expanded', 'true');

    collapsedState = [];
  });

  it('collapsing the family section also hides its nested groups', () => {
    collapsedState = ['cpu'];

    render(
      <MonitoringPage
        serviceOnline={true}
        connectionState="online"
        tab="detailed"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /monitoring\.detailed\.cpu/i })).toHaveAttribute('aria-expanded', 'false');
    // A collapsed family renders no body, so the nested group header is gone
    // from the DOM too, not merely its rows.
    expect(screen.queryByRole('button', { name: /^Load$/ })).toBeNull();
    expect(screen.queryByText('CPU Total')).toBeNull();

    collapsedState = [];
  });

  it('hides the System section when the motherboard model is known but LHM reports no sensors', () => {
    sensorState.motherboardModel = 'ASUS Test Board';
    sensorState.motherboard = [];

    render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab="detailed" onTabChange={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.system/i })).toBeNull();

    sensorState.motherboardModel = '';
  });

  it('shows the System section once the motherboard reports at least one sensor', () => {
    sensorState.motherboardModel = 'ASUS Test Board';
    sensorState.motherboard = [
      { id: 'mobo/temp', name: 'System Temperature', type: 'Temperature', value: 35, units: 'C', formatted: '35 C', parent: { id: 'motherboard', name: 'mobo' } },
    ];

    render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab="detailed" onTabChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /monitoring\.detailed\.system/i })).toBeInTheDocument();

    sensorState.motherboardModel = '';
    sensorState.motherboard = [];
  });

  it('hides an extras section whose only component reports zero sensors', () => {
    extrasState.psus = [{ id: 'psu/0', name: 'Test PSU', sensors: [] }];

    render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab="detailed" onTabChange={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.psu/i })).toBeNull();

    extrasState.psus = [];
  });

  it('hides the GPU tab when no live GPU load sensor is present (macOS / AMD-Linux)', () => {
    sensorState.gpu = [];
    render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab={null} onTabChange={vi.fn()} />,
    );
    expect(screen.queryByRole('tab', { name: 'monitoring.tab.gpu' })).toBeNull();
  });

  it('shows the GPU tab when a live GPU load sensor is present (Windows / NVIDIA-Linux)', () => {
    sensorState.gpu = [
      { id: 'gpu/0/load', name: 'GPU Core', type: 'Load', value: 30, units: '%', formatted: '30%', parent: { id: 'gpu/0', name: 'gpu' } },
    ];
    render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab={null} onTabChange={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'monitoring.tab.gpu' })).toBeInTheDocument();
    sensorState.gpu = [];
  });
});
