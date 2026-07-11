import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { CoolingSection } from './CoolingSection';
import { DiagnosticsView } from './DiagnosticsView';
import { GpuSection } from './GpuSection';
import { IncidentsSection } from './IncidentsSection';
import { IncidentCounts } from './IncidentCounts';
import { MemorySection } from './MemorySection';
import { StorageSection } from './StorageSection';
import { SystemSection } from './SystemSection';
import { ToastProvider } from '../../common/Toast/Toast';
import { setActiveTransport } from '../../../api/service';
import { useDiagnosticsTemperatureApps } from '../../../hooks/useDiagnosticsTemperatureApps';
import { useDiagnosticsTemperatures } from '../../../hooks/useDiagnosticsTemperatures';
import type {
  DiagnosticsComponent,
  DiagnosticsCoolingResponse,
  DiagnosticsCounts30d,
  DiagnosticsGpuResponse,
  DiagnosticsHealth,
  DiagnosticsIncident,
  DiagnosticsIncidentsResponse,
  DiagnosticsMemoryResponse,
  DiagnosticsSmartResponse,
  DiagnosticsSystemResponse,
} from '../../../api/diagnostics';

// Controllable health payload for the DiagnosticsView tab-navigation tests
// below; every other domain resource stays null/empty since those tests
// only exercise tab switching, not each section's own data rendering.
let mockHealth: DiagnosticsHealth | null = null;

vi.mock('../../../hooks/useDiagnosticsHealth', () => ({
  useDiagnosticsHealth: () => ({ health: mockHealth, loading: false, error: false, mocked: false, refresh: vi.fn() }),
}));

vi.mock('../../../hooks/useDiagnosticsResource', () => ({
  useDiagnosticsResource: () => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() }),
}));

vi.mock('../../../hooks/useDiagnosticsTemperatures', () => ({
  useDiagnosticsTemperatures: vi.fn(() => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() })),
}));

vi.mock('../../../hooks/useDiagnosticsTemperatureApps', () => ({
  useDiagnosticsTemperatureApps: vi.fn(() => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() })),
}));

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const zeroCounts: DiagnosticsCounts30d = { whea: 0, bugchecks: 0, dirtyShutdowns: 0, diskErrors: 0, tdrs: 0, appCrashes: 0 };

// IncidentsSection reads useToast() unconditionally (Open Event Viewer / Clear
// logs actions), so every render needs a ToastProvider ancestor.
function renderIncidents(props: {
  data: DiagnosticsIncidentsResponse | null;
  loading?: boolean;
  error?: boolean;
  onRefresh?: () => void;
  onLogsCleared?: () => void;
  hours?: 24 | 72 | 168 | 336;
  date?: string | null;
  onHoursChange?: (hours: 24 | 72 | 168 | 336) => void;
  onDateChange?: (date: string) => void;
}) {
  const {
    data, loading = false, error = false, onRefresh = () => {}, onLogsCleared = () => {},
    hours = 168, date = null, onHoursChange = () => {}, onDateChange = () => {},
  } = props;
  return render(
    <ToastProvider>
      <IncidentsSection
        data={data} loading={loading} error={error} onRefresh={onRefresh} onLogsCleared={onLogsCleared}
        hours={hours} date={date} onHoursChange={onHoursChange} onDateChange={onDateChange}
      />
    </ToastProvider>,
  );
}

describe('IncidentCounts', () => {
  it('renders the Last 30 days counters', () => {
    render(<IncidentCounts counts30d={{ whea: 6, bugchecks: 0, dirtyShutdowns: 7, diskErrors: 0, tdrs: 0, appCrashes: 88 }} />);
    expect(screen.getByText('diagnostics.system.counts.title')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
  });

  it('renders nothing when the counts have not loaded', () => {
    const { container } = render(<IncidentCounts counts30d={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function renderSystem(data: DiagnosticsSystemResponse | null) {
  return render(
    <ToastProvider>
      <SystemSection data={data} loading={false} error={false} onRefresh={() => {}} />
    </ToastProvider>,
  );
}

describe('ComponentHealthGrid domain tiles', () => {
  it('always renders four domain tiles in storage/memory/cooling/system order', () => {
    render(<ComponentHealthGrid components={[]} onNavigate={() => {}} />);
    const titles = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(titles).toEqual([
      'diagnostics.kind.storage', 'diagnostics.kind.memory', 'diagnostics.kind.cooling', 'diagnostics.kind.system',
    ]);
  });

  it('folds a GPU component into the Cooling tile status and reasons', () => {
    const components: DiagnosticsComponent[] = [
      {
        id: 'gpu:0', kind: 'gpu', name: 'GPU', status: 'watch',
        reasons: [{ code: 'gpu.thermalThrottle', severity: 'watch', summary: 'GPU is throttling', detail: 'd' }],
      },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);
    expect(screen.getByText('diagnostics.status.watch')).toBeInTheDocument();
    // reasonLabel falls back to the summary (no I18nProvider), so the label and
    // the summary line render the same text - assert at least one is present.
    expect(screen.getAllByText('GPU is throttling').length).toBeGreaterThan(0);
  });

  it('names the monitored devices in a healthy tile body', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'storage:a', kind: 'storage', name: 'Samsung SSD 990 PRO', status: 'ok', reasons: [] },
      { id: 'storage:b', kind: 'storage', name: 'WD Blue 4TB', status: 'ok', reasons: [] },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);
    expect(screen.getByText('Samsung SSD 990 PRO, WD Blue 4TB')).toBeInTheDocument();
  });

  it('navigates to the matching tab when a tile is clicked', () => {
    const onNavigate = vi.fn();
    render(<ComponentHealthGrid components={[]} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('heading', { level: 4, name: 'diagnostics.kind.system' }));
    expect(onNavigate).toHaveBeenCalledWith('system');
  });

  it('navigates via keyboard (Enter) for accessibility', () => {
    const onNavigate = vi.fn();
    render(<ComponentHealthGrid components={[]} onNavigate={onNavigate} />);
    const card = screen.getByRole('button', { name: /diagnostics.kind.storage/ });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('storage');
  });
});

function makeIncident(overrides: Partial<DiagnosticsIncident> & Pick<DiagnosticsIncident, 'id' | 'timeUtc' | 'source'>): DiagnosticsIncident {
  return {
    severity: 'info', title: 'Incident', detail: '', app: null, data: {}, repeatCount: 1, firstUtc: null, ...overrides,
  };
}

describe('IncidentsSection timeline', () => {
  // A fixed clock so the 2026-07 fixtures fall inside the default 7-day window
  // regardless of the machine's wall clock.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const response: DiagnosticsIncidentsResponse = {
    supported: true,
    windowDays: 30,
    incidents: [
      makeIncident({ id: 'System/1', timeUtc: '2026-07-06T23:54:42Z', source: 'whea', severity: 'warning', title: 'Corrected PCIe hardware error' }),
      makeIncident({ id: 'App/2', timeUtc: '2026-07-05T20:12:03Z', source: 'appCrash', severity: 'critical', title: 'cyberpunk2077.exe crashed' }),
    ],
  };

  it('renders every category as a lane (empty ones included) and a dot per incident', () => {
    const { container } = renderIncidents({ data: response });
    // Categories with incidents...
    expect(screen.getByText('diagnostics.incidents.source.whea')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.source.appCrash')).toBeInTheDocument();
    // ...and a category with none is still a lane, never stripped.
    expect(screen.getByText('diagnostics.incidents.source.bugcheck')).toBeInTheDocument();
    // One hit target per incident (empty lanes contribute no dots).
    expect(container.querySelectorAll('circle[fill="transparent"]')).toHaveLength(2);
  });

  it('reveals the underlying incident in a tooltip on hover', () => {
    const { container } = renderIncidents({ data: response });
    fireEvent.mouseEnter(container.querySelectorAll('circle[fill="transparent"]')[0]);
    expect(screen.getByText('Corrected PCIe hardware error')).toBeInTheDocument();
  });

  it('opens the clicked incident detail under the graph, hidden until clicked', () => {
    const withApp: DiagnosticsIncidentsResponse = {
      supported: true, windowDays: 30,
      incidents: [makeIncident({
        id: 'App/9', timeUtc: '2026-07-06T10:00:00Z', source: 'appCrash', severity: 'critical', title: 'game.exe crashed',
        detail: 'Exception c0000005 in nv.dll.',
        app: { name: 'game.exe', path: 'D:/game.exe', exceptionCode: 'c0000005', faultingModule: 'nv.dll', isGame: true },
      })],
    };
    const { container } = renderIncidents({ data: withApp });
    // The server detail line + game badge only appear once the dot is clicked.
    expect(screen.queryByText('Exception c0000005 in nv.dll.')).not.toBeInTheDocument();
    fireEvent.click(container.querySelectorAll('circle[fill="transparent"]')[0]);
    expect(screen.getByText('Exception c0000005 in nv.dll.')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.game')).toBeInTheDocument();
  });

  it('offers the 24h/3d/7d/14d range chips', () => {
    renderIncidents({ data: response });
    expect(screen.getByRole('button', { name: 'diagnostics.temperature.range.24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'diagnostics.temperature.range.14d' })).toBeInTheDocument();
  });

  it('still renders the full-range timeline (all lanes) when no incident falls in the range', () => {
    const { container } = renderIncidents({ data: response, hours: 24 });
    expect(screen.getByText('diagnostics.incidents.source.whea')).toBeInTheDocument();
    expect(container.querySelectorAll('circle[fill="transparent"]')).toHaveLength(0);
    expect(screen.queryByText('Corrected PCIe hardware error')).not.toBeInTheDocument();
  });
});

describe('IncidentsSection log actions', () => {
  const response: DiagnosticsIncidentsResponse = {
    supported: true,
    windowDays: 30,
    incidents: [makeIncident({ id: 'System/1', timeUtc: '2026-07-06T23:54:42Z', source: 'whea', title: 'Corrected PCIe hardware error' })],
  };

  beforeEach(() => {
    localStorage.setItem('nexus_token', 'test-token');
    setActiveTransport('lan');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setActiveTransport(null);
  });

  it('opens Event Viewer via the service and shows no toast on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { opened: true })));
    renderIncidents({ data: response });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.openEventViewer' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'diagnostics.incidents.openEventViewer' })).not.toHaveAttribute('data-loading', 'true'));
    expect(screen.queryByText('diagnostics.incidents.openEventViewerFailed')).not.toBeInTheDocument();
  });

  it('shows a failure toast when opening Event Viewer fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    renderIncidents({ data: response });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.openEventViewer' }));

    await waitFor(() => expect(screen.getByText('diagnostics.incidents.openEventViewerFailed')).toBeInTheDocument());
  });

  it('requires a destructive confirm before clearing Windows event logs', () => {
    renderIncidents({ data: response });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.clearLogs' }));

    expect(screen.getByText('diagnostics.incidents.clearLogsConfirmTitle')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.clearLogsConfirmMessage')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.clearLogsNote')).toBeInTheDocument();
  });

  it('clears the logs, force-refreshes incidents, and notifies the parent on confirm', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { cleared: true, systemError: '', applicationError: '' })));
    const onRefresh = vi.fn();
    const onLogsCleared = vi.fn();
    renderIncidents({ data: response, onRefresh, onLogsCleared });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.clearLogs' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'diagnostics.incidents.clearLogs' })[1]);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onLogsCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByText('diagnostics.incidents.clearLogsSuccess')).toBeInTheDocument();
  });

  it('still refreshes and surfaces the server detail when the service only partially clears the logs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { cleared: false, systemError: 'Access denied', applicationError: '' })));
    const onRefresh = vi.fn();
    const onLogsCleared = vi.fn();
    renderIncidents({ data: response, onRefresh, onLogsCleared });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.clearLogs' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'diagnostics.incidents.clearLogs' })[1]);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onLogsCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByText('diagnostics.incidents.clearLogsFailedDetail')).toBeInTheDocument();
  });

  it('shows a failure toast and does not refresh when the request never completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})));
    const onRefresh = vi.fn();
    const onLogsCleared = vi.fn();
    renderIncidents({ data: response, onRefresh, onLogsCleared });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.clearLogs' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'diagnostics.incidents.clearLogs' })[1]);

    await waitFor(() => expect(screen.getByText('diagnostics.incidents.clearLogsFailed')).toBeInTheDocument());
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onLogsCleared).not.toHaveBeenCalled();
  });

  it('hides the Open Event Viewer / Clear Windows event logs actions while unsupported or not yet loaded', () => {
    renderIncidents({ data: { ...response, supported: false } });
    expect(screen.queryByRole('button', { name: 'diagnostics.incidents.openEventViewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'diagnostics.incidents.clearLogs' })).not.toBeInTheDocument();

    renderIncidents({ data: null });
    expect(screen.queryAllByRole('button', { name: 'diagnostics.incidents.openEventViewer' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'diagnostics.incidents.clearLogs' })).toHaveLength(0);
  });
});

describe('SystemSection PnP problems', () => {
  const baseData: DiagnosticsSystemResponse = {
    supported: true,
    pnpProblems: [],
    counts30d: zeroCounts,
  };

  it('shows the mapped human explanation for a known problem code, code/text/id hidden until expanded', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: 'Unknown USB Device', deviceId: 'USB\\VID_0000', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' }],
    };
    renderSystem(data);

    expect(screen.getByText('diagnostics.system.problemCode.28')).toBeInTheDocument();
    expect(screen.queryByText(/CM_PROB_FAILED_INSTALL/)).not.toBeInTheDocument();
  });

  it('reveals problem code, text, and device id when a row is expanded', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: 'Unknown USB Device', deviceId: 'USB\\VID_0000', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' }],
    };
    renderSystem(data);

    fireEvent.click(screen.getByText('Unknown USB Device'));

    expect(screen.getByText('CM_PROB_FAILED_INSTALL')).toBeInTheDocument();
    expect(screen.getByText('USB\\VID_0000')).toBeInTheDocument();
  });

  it('falls back to a generic labeled line for an unmapped code', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: 'Mystery Device', deviceId: 'ACPI\\PNP0C0D', problemCode: 99, problemText: 'CM_PROB_UNKNOWN' }],
    };
    renderSystem(data);

    expect(screen.getByText('diagnostics.system.problemCodeFallback')).toBeInTheDocument();
  });

  it('falls back to an "unknown device" label when the server sends an empty name', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: '', deviceId: 'ACPI\\PNP0C0D', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' }],
    };
    renderSystem(data);

    expect(screen.getByText('diagnostics.system.unknownDevice')).toBeInTheDocument();
  });

  it('offers Open Device Manager only when there is at least one problem', () => {
    renderSystem(baseData);
    expect(screen.queryByRole('button', { name: 'diagnostics.system.openDeviceManager' })).not.toBeInTheDocument();

    renderSystem({ ...baseData, pnpProblems: [{ name: 'Dev', deviceId: 'X', problemCode: 28, problemText: 'T' }] });
    expect(screen.getByRole('button', { name: 'diagnostics.system.openDeviceManager' })).toBeInTheDocument();
  });
});

// The tab is the title now - each domain section renders without its own
// redundant top-level kind heading, while sub-group headers nested inside a
// section (NVMe health, Throttling, Device problems) still render.
describe('domain sections render without their outer kind title', () => {
  it('StorageSection omits the outer "Storage" title but still renders drive content', () => {
    const data: DiagnosticsSmartResponse = {
      supported: true,
      drives: [{
        id: 'storage:a', name: 'Test Drive', serial: 'SN1', bus: 'nvme', sizeBytes: 1000, temperatureC: 40,
        powerOnHours: 10, powerCycles: 1, healthPercent: 99, status: 'good', statusReasons: [], attributes: [], nvme: null,
      }],
    };
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.queryByText('diagnostics.kind.storage')).not.toBeInTheDocument();
    expect(screen.getByText('Test Drive')).toBeInTheDocument();
  });

  it('CoolingSection omits the outer "Cooling" title but still renders device rows', () => {
    const data: DiagnosticsCoolingResponse = {
      supported: true,
      devices: [{ id: 'cooling:fan1', name: 'Fan 1', type: 'fan', rpm: 1000, targetDutyPercent: 50, status: 'ok', sinceUtc: null }],
    };
    render(<CoolingSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.queryByText('diagnostics.kind.cooling')).not.toBeInTheDocument();
    expect(screen.getByText('Fan 1')).toBeInTheDocument();
  });

  it('GpuSection omits its kind title by default but renders a passed heading and its Throttling sub-header', () => {
    const data: DiagnosticsGpuResponse = {
      supported: true,
      gpus: [{
        name: 'Test GPU', driverVersion: '1.0', temperatureC: 50, powerW: 100,
        throttle: { active: [], swPowerCapUs: 0, swThermalUs: 0, hwThermalUs: 0, hwPowerBrakeUs: 0 }, recentTdrCount: 0,
      }],
    };
    render(<GpuSection data={data} loading={false} error={false} onRefresh={() => {}} heading="GPU health" />);

    expect(screen.queryByText('diagnostics.kind.gpu')).not.toBeInTheDocument();
    expect(screen.getByText('GPU health')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.gpu.throttle.title')).toBeInTheDocument();
    expect(screen.getByText('Test GPU')).toBeInTheDocument();
  });

  it('MemorySection omits the outer "Memory" title but still renders module rows', () => {
    const data: DiagnosticsMemoryResponse = {
      supported: true,
      modules: [{ slot: 'DIMM_A1', sizeBytes: 1000, maxSpeedMts: 6000, configuredSpeedMts: 6000, manufacturer: 'Test', partNumber: 'PN1' }],
      xmpLikelyActive: null, lastTest: null, testScheduled: false,
    };
    render(
      <ToastProvider>
        <MemorySection data={data} loading={false} error={false} onRefresh={() => {}} />
      </ToastProvider>,
    );

    expect(screen.queryByText('diagnostics.kind.memory')).not.toBeInTheDocument();
    expect(screen.getByText('DIMM_A1')).toBeInTheDocument();
  });

  it('SystemSection omits the outer "System" title but keeps its Device problems header', () => {
    const data: DiagnosticsSystemResponse = {
      supported: true,
      pnpProblems: [],
      counts30d: zeroCounts,
    };
    renderSystem(data);

    expect(screen.queryByText('diagnostics.kind.system')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.system.pnpProblems')).toBeInTheDocument();
  });
});

describe('DiagnosticsView tabs', () => {
  beforeEach(() => {
    mockHealth = null;
  });

  function renderDiagnosticsView(props: { tab: string | null; onTabChange: (tab: string) => void }) {
    return render(
      <ToastProvider>
        <DiagnosticsView serviceOnline={true} connectionState="online" tab={props.tab} onTabChange={props.onTabChange} />
      </ToastProvider>,
    );
  }

  it('defaults to the summary tab without forcing a route write', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: null, onTabChange });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.summary/ })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps an invalid url tab render-only instead of normalizing history', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'not-a-real-tab', onTabChange });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.summary/ })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('redirects a legacy ?tab=gpu deep link to the Cooling tab', () => {
    renderDiagnosticsView({ tab: 'gpu', onTabChange: vi.fn() });

    expect(screen.getByRole('tab', { name: /diagnostics.kind.cooling/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('deep-links straight into a domain tab from the url param', () => {
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    expect(screen.getByRole('tab', { name: /diagnostics.kind.cooling/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('diagnostics.temperature.title')).toBeInTheDocument();
  });

  it('clicking a tab reports the new tab key to onTabChange', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: null, onTabChange });

    fireEvent.click(screen.getByRole('tab', { name: /diagnostics.kind.memory/ }));

    expect(onTabChange).toHaveBeenCalledWith('memory', expect.anything());
  });

  it('a Summary domain tile navigates straight to its tab, with GPU folded into Cooling', () => {
    mockHealth = {
      generatedAt: '2026-07-08T02:00:00Z',
      supported: true,
      overall: 'watch',
      components: [{ id: 'gpu:0', kind: 'gpu', name: 'Test GPU', status: 'watch', reasons: [] }],
    };
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: null, onTabChange });

    // "diagnostics.kind.cooling" also labels the Cooling tab button (no
    // I18nProvider means both resolve to the same raw key) - target the tile's
    // own heading specifically.
    fireEvent.click(screen.getByRole('heading', { level: 4, name: 'diagnostics.kind.cooling' }));

    expect(onTabChange).toHaveBeenCalledWith('cooling');
  });

  it('picking a day switches useDiagnosticsTemperatures to a date query, and clicking a range chip clears it back to hours', () => {
    const temperaturesSpy = vi.mocked(useDiagnosticsTemperatures);
    temperaturesSpy.mockClear();
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    expect(temperaturesSpy.mock.calls.at(-1)?.[1]).toEqual({ hours: 168 });

    fireEvent.click(screen.getByLabelText('diagnostics.temperature.dayPickerAriaLabel'));
    fireEvent.click(screen.getByText('datepicker.today'));

    expect(temperaturesSpy.mock.calls.at(-1)?.[1]).toHaveProperty('date');

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.temperature.range.24h' }));

    expect(temperaturesSpy.mock.calls.at(-1)?.[1]).toEqual({ hours: 24 });
  });

  it('fetches the hover-tooltip app breakdown whenever the service is online, sharing the temperature chart\'s query', () => {
    const appsSpy = vi.mocked(useDiagnosticsTemperatureApps);
    appsSpy.mockClear();
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    expect(appsSpy.mock.calls.at(-1)).toEqual([true, { hours: 168 }]);

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.temperature.range.24h' }));

    expect(appsSpy.mock.calls.at(-1)).toEqual([true, { hours: 24 }]);
  });
});
