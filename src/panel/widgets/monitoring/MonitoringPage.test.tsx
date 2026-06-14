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

vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({
    batteries: [
      { id: 'battery/0', name: 'Test Battery', sensors: [
        { id: 'battery/0/charge', name: 'Charge Level', type: 'Level', value: 80, units: '%', formatted: '80%', parent: { id: 'battery/0', name: 'Test Battery' } },
      ] },
    ],
    nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [],
  }),
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

    // GPU has zero sensors and zero extras-equivalents -- the section must not render.
    expect(screen.queryByRole('button', { name: /monitoring\.detailed\.gpu/i })).toBeNull();

    // Click toggles collapse and persists the section id through useUiSettings.
    fireEvent.click(cpuHeader);
    expect(updateMock).toHaveBeenCalledWith({ monitoringDetailedCollapsed: ['cpu'] });
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
