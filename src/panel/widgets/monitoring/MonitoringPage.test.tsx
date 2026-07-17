import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonitoringPage } from './MonitoringPage';
import type { GpuComponent } from '../../../lib/gpuResolver';
import type { AppWindowSeries } from '../../../api/monitoringHistoryApps';

// MetricHistorySection and ProcessListSection are the persistent hero + list
// mounted once above the switched tab content - stub both with a
// mount/unmount + prop tracer so tests can assert they stay mounted across a
// metric-tab switch (only their metric-scoped props should change) and
// unmount only on the unrelated 'detailed' page (item 19's zero-flicker
// contract).
let metricHistoryMounts = 0;
let metricHistoryUnmounts = 0;
vi.mock('./page/MetricHistorySection', () => ({
  MetricHistorySection: ({ metric }: { metric: string }) => {
    useEffect(() => {
      metricHistoryMounts++;
      return () => { metricHistoryUnmounts++; };
    }, []);
    return <div data-testid="metric-history-section">metric:{metric}</div>;
  },
}));

let processListMounts = 0;
let processListUnmounts = 0;
vi.mock('./page/ProcessListSection', async importOriginal => {
  const actual = await importOriginal<typeof import('./page/ProcessListSection')>();
  return {
    ...actual,
    ProcessListSection: ({ items, frozen }: { items: Array<{ name: string }>; frozen?: boolean }) => {
      useEffect(() => {
        processListMounts++;
        return () => { processListUnmounts++; };
      }, []);
      return (
        <div data-testid="process-list-section" data-frozen={frozen ? 'true' : 'false'}>
          items:{items.length}:{items.map(i => i.name).join(',')}
        </div>
      );
    },
  };
});

let historyOverride: Partial<{ following: boolean; mocked: boolean }> = {};
vi.mock('../../../hooks/useMetricHistory', () => ({
  useMetricHistory: () => ({
    silhouette: [], series: [],
    domain: [0, 1], stripDomain: [0, 1],
    rangeKey: '30m', lastPresetKey: '30m', following: true,
    loading: false, error: false, mocked: false, supported: true, retentionDays: 7,
    stepSeconds: 1, viewportGeneration: 1,
    setRange: () => {}, onBrushChange: () => {}, onChartDragSelect: () => {}, backToLive: () => {}, retry: () => {},
    ...historyOverride,
  }),
}));

let appsWindowOverride: Partial<{ apps: AppWindowSeries[]; supported: boolean; ready: boolean }> = {};
vi.mock('../../../hooks/useMetricHistoryApps', () => ({
  useMetricHistoryApps: () => ({ apps: [], loading: false, supported: true, mocked: false, ready: true, ...appsWindowOverride }),
}));

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: { memory: 'Test Memory 32GB' } }),
}));

vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({
    series: [],
    sampleCount: 0,
    totalRate: 0,
    totalRateIn: 0,
    totalRateOut: 0,
    entries: [],
  }),
}));

let cpuSeriesOverride: Array<{ name: string; current: number; values: number[] }> = [];
vi.mock('../../../hooks/useProcessMonitor', () => ({
  useProcessMonitor: () => ({
    cpuSeries: cpuSeriesOverride,
    memSeries: [],
    sampleCount: 0,
    totalCpu: 0,
    totalMemMb: 0,
  }),
  useGpuProcessFeed: () => {},
  useGpuProcessData: () => ({ procSeries: [], procMemSeries: [] }),
}));

const sensorState = {
  summary: [] as Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>,
  cpu: [
    { id: 'cpu/load', name: 'CPU Total', type: 'Load', value: 42, units: '%', formatted: '42%', parent: { id: 'cpu', name: 'cpu' } },
  ],
  gpu: [] as Array<{ id: string; name: string; type: string; value: number; units: string; formatted: string; parent: { id: string; name: string } }>,
  gpuComponents: [] as GpuComponent[],
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
    settings: { preferredGpuId: '', monitoringDetailedCollapsed: collapsedState },
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

describe('MonitoringPage', () => {
  it('defaults to cpu (the removed overview tab is gone) without forcing a route tab write', () => {
    const onTabChange = vi.fn();
    render(
      <MonitoringPage
        serviceOnline={false}
        connectionState="offline"
        tab={null}
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'monitoring.tab.cpu' })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps invalid url tabs (including the removed "overview") render-only instead of normalizing history', () => {
    const onTabChange = vi.fn();
    render(
      <MonitoringPage
        serviceOnline={false}
        connectionState="offline"
        tab="overview"
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'monitoring.tab.cpu' })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('mounts the hero + process list once above the switched content and unmounts them only on the unrelated Detailed page (zero-flicker tab switch)', () => {
    metricHistoryMounts = 0;
    metricHistoryUnmounts = 0;
    processListMounts = 0;
    processListUnmounts = 0;

    const { rerender } = render(
      <MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />,
    );
    expect(metricHistoryMounts).toBe(1);
    expect(processListMounts).toBe(1);
    expect(screen.getByTestId('metric-history-section')).toHaveTextContent('metric:cpu');

    // Switching between metric tabs swaps the metric-scoped props without
    // remounting the hero or the list - the brush/viewport state and the
    // list's search/sort state must survive.
    rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="memory" onTabChange={vi.fn()} />);
    expect(metricHistoryMounts).toBe(1);
    expect(metricHistoryUnmounts).toBe(0);
    expect(processListMounts).toBe(1);
    expect(processListUnmounts).toBe(0);
    expect(screen.getByTestId('metric-history-section')).toHaveTextContent('metric:memory');

    rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="network" onTabChange={vi.fn()} />);
    expect(metricHistoryMounts).toBe(1);
    expect(metricHistoryUnmounts).toBe(0);
    expect(processListMounts).toBe(1);
    expect(processListUnmounts).toBe(0);
    expect(screen.getByTestId('metric-history-section')).toHaveTextContent('metric:network');

    // Detailed is a real page switch: neither has a place there.
    rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="detailed" onTabChange={vi.fn()} />);
    expect(screen.queryByTestId('metric-history-section')).toBeNull();
    expect(screen.queryByTestId('process-list-section')).toBeNull();
    expect(metricHistoryUnmounts).toBe(1);
    expect(processListUnmounts).toBe(1);

    rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(metricHistoryMounts).toBe(2);
    expect(processListMounts).toBe(2);
    expect(screen.getByTestId('metric-history-section')).toHaveTextContent('metric:cpu');
  });

  it('shows the CPU model as the tab title, with no sensor-strip block', () => {
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(screen.getByText('test cpu')).toBeInTheDocument();
  });

  it('shows the resolved GPU name as the tab title, with a Change link when more than one GPU is present', () => {
    sensorState.gpu = [
      { id: 'gpu/0/load', name: 'GPU Core', type: 'Load', value: 30, units: '%', formatted: '30%', parent: { id: 'gpu/0', name: 'gpu' } },
    ];
    sensorState.gpuComponents = [
      { id: 'gpu/0', name: 'RTX 3070', adapterLuid: '0:1', sensors: [] },
      { id: 'gpu/1', name: 'RTX 4090', adapterLuid: '0:2', sensors: [] },
    ];
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="gpu" onTabChange={vi.fn()} />);
    expect(screen.getByText('RTX 3070')).toBeInTheDocument();
    expect(screen.getByText('monitoring.gpu.change')).toBeInTheDocument();

    sensorState.gpu = [];
    sensorState.gpuComponents = [];
  });

  it('shows the memory hardware identity (from system specs) as the Memory tab title', () => {
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="memory" onTabChange={vi.fn()} />);
    expect(screen.getByText('Test Memory 32GB')).toBeInTheDocument();
  });

  it('shows the Network tab name in the same title row/style as the hardware-model titles (item 32)', () => {
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="network" onTabChange={vi.fn()} />);
    expect(screen.queryByTestId('metric-history-section')).toHaveTextContent('metric:network');
    const title = document.querySelector('[class*="tabHeaderName"]');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('monitoring.tab.network');
  });

  it('shows the mocked badge next to the tab title when the history data is dev-mocked (item 32: badge moved out of MetricHistorySection)', () => {
    historyOverride = { mocked: true };
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(screen.getByText('monitoring.history.mocked')).toBeInTheDocument();
    historyOverride = {};
  });

  it('shows no mocked badge when the data is real', () => {
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(screen.queryByText('monitoring.history.mocked')).toBeNull();
  });

  it('shows the live fallback rows (not an empty list) while the window-scoped apps endpoint has not yet responded', () => {
    appsWindowOverride = { ready: false, apps: [{ name: 'ShouldNotShowUntilReady', avg: 1, max: 1, points: [] }] };
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(screen.getByTestId('process-list-section')).not.toHaveTextContent('ShouldNotShowUntilReady');
    appsWindowOverride = {};
  });

  it('shows the window-scoped apps once ready', () => {
    appsWindowOverride = { ready: true, apps: [{ name: 'chrome.exe', avg: 12, max: 15, points: [] }] };
    render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
    expect(screen.getByTestId('process-list-section')).toHaveTextContent('chrome.exe');
    appsWindowOverride = {};
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

  describe('frozen fallback snapshot on detach (item 33)', () => {
    afterEach(() => {
      historyOverride = {};
      cpuSeriesOverride = [];
      appsWindowOverride = {};
    });

    it('does not freeze (or dim) the fallback rows while following live', () => {
      // Force the fallback path (no windowed apps endpoint) - the scenario
      // the freeze logic exists for.
      appsWindowOverride = { supported: false };
      cpuSeriesOverride = [{ name: 'LiveApp', current: 10, values: [1, 2, 3] }];
      historyOverride = { following: true };
      render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      const section = screen.getByTestId('process-list-section');
      expect(section).toHaveAttribute('data-frozen', 'false');
      expect(section).toHaveTextContent('LiveApp');
    });

    it('freezes the fallback rows as a snapshot on detach, ignoring further live updates, and unfreezes on re-attach', () => {
      appsWindowOverride = { supported: false };
      cpuSeriesOverride = [{ name: 'LiveApp', current: 10, values: [1, 2, 3] }];
      historyOverride = { following: true };
      const { rerender } = render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      expect(screen.getByTestId('process-list-section')).toHaveTextContent('LiveApp');

      // Detach: the fallback source has no windowed data, so it must freeze
      // at whatever it was showing, not keep ticking with the live feed.
      historyOverride = { following: false };
      rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      let section = screen.getByTestId('process-list-section');
      expect(section).toHaveAttribute('data-frozen', 'true');
      expect(section).toHaveTextContent('LiveApp');

      // The live feed keeps pushing a NEW process while still detached - the
      // frozen snapshot must not pick it up.
      cpuSeriesOverride = [{ name: 'NewLiveApp', current: 50, values: [9, 9, 9] }];
      rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      section = screen.getByTestId('process-list-section');
      expect(section).toHaveTextContent('LiveApp');
      expect(section).not.toHaveTextContent('NewLiveApp');

      // Re-attaching unfreezes: the rows resume tracking the live feed.
      historyOverride = { following: true };
      rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      section = screen.getByTestId('process-list-section');
      expect(section).toHaveAttribute('data-frozen', 'false');
      expect(section).toHaveTextContent('NewLiveApp');
    });

    it('re-snapshots per metric when the tab changes while still detached, instead of showing a stale other-metric snapshot', () => {
      appsWindowOverride = { supported: false };
      cpuSeriesOverride = [{ name: 'CpuApp', current: 10, values: [1] }];
      historyOverride = { following: false };
      const { rerender } = render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      expect(screen.getByTestId('process-list-section')).toHaveTextContent('CpuApp');

      cpuSeriesOverride = [{ name: 'CpuAppLater', current: 20, values: [2] }];
      rerender(<MonitoringPage serviceOnline={true} connectionState="online" tab="memory" onTabChange={vi.fn()} />);
      const section = screen.getByTestId('process-list-section');
      // memSeries is empty in this suite's mock, so the memory tab's fresh
      // snapshot is empty - not the stale CPU snapshot from before the switch.
      expect(section).not.toHaveTextContent('CpuApp');
      expect(section).toHaveAttribute('data-frozen', 'true');
    });

    it('does not freeze the window-scoped apps source when detached (already gated on following at the hook level)', () => {
      appsWindowOverride = { ready: true, supported: true, apps: [{ name: 'WindowedApp', avg: 5, max: 5, points: [] }] };
      historyOverride = { following: false };
      render(<MonitoringPage serviceOnline={true} connectionState="online" tab="cpu" onTabChange={vi.fn()} />);
      const section = screen.getByTestId('process-list-section');
      expect(section).toHaveAttribute('data-frozen', 'false');
      expect(section).toHaveTextContent('WindowedApp');
      appsWindowOverride = {};
    });
  });
});
