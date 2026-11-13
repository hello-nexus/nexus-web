import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { DiagnosticsView } from './DiagnosticsView';
import { IncidentsSection } from './IncidentsSection';
import { IncidentCounts } from './IncidentCounts';
import { MemorySection } from './MemorySection';
import { StorageSection } from './StorageSection';
import { SystemSection } from './SystemSection';
import { SystemTab } from './SystemTab';
import { ToastProvider } from '../../common/Toast/Toast';
import { setActiveTransport } from '../../../api/service';
import { useDiagnosticsTemperatures } from '../../../hooks/useDiagnosticsTemperatures';
import { useMetricHistory } from '../../../hooks/useMetricHistory';
import { COOLING_HISTORY_SERIES_QUERY } from './coolingHistoryHelpers';
import type {
  DiagnosticsComponent,
  DiagnosticsCounts30d,
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
const mockRefreshHealth = vi.hoisted(() => vi.fn());
// An unacknowledged, ended thermal guard trip, so the Cooling tab shows the dismissable notice.
const mockGuardTrip = vi.hoisted(() => ({ on: false }));

vi.mock('../../../hooks/useDiagnosticsHealth', () => ({
  useDiagnosticsHealth: () => ({ health: mockHealth, loading: false, error: false, mocked: false, refresh: mockRefreshHealth }),
}));

// Sensor alert rules and states for the Summary list and the Thermals tab, which read the same hook.
const mockAlerts = vi.hoisted(() => ({
  rules: [] as unknown[], states: [] as unknown[], acknowledge: vi.fn(async () => true),
}));

vi.mock('../../../hooks/useSensorAlerts', () => ({
  useSensorAlerts: () => ({
    rules: mockAlerts.rules, states: mockAlerts.states, loading: false, loaded: true, error: false, atLimit: false,
    preview: vi.fn(), save: vi.fn(), add: vi.fn(), remove: vi.fn(), refresh: vi.fn(), acknowledge: mockAlerts.acknowledge,
  }),
}));

// The Summary list reads live values through the sensor lookup; none here, so a row falls back to the state value.
vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({ SensorPicker: () => null, useSensorLookup: () => ({ sensors: [], extras: {}, networkSensors: [], resolve: () => undefined }) }));
vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useUiSettings: () => ({ settings: { diagnosticsComponentSystem: true }, update: vi.fn() }),
}));
vi.mock('../../../panel/widgets/monitoring/sensorPicker', async importOriginal => ({ ...(await importOriginal<object>()), sensorsForDevice: () => [] }));

// The per-tab switches need the UI settings provider and have their own suite.

vi.mock('../../../hooks/useThermalGuard', () => ({
  useThermalGuard: () => ({
    guard: mockGuardTrip.on
      ? { lastTrip: { atUtcMs: 1, peakC: 90, reason: 'limit', escalated: false, endedAtUtcMs: 2, acknowledged: false } }
      : null,
    fetchedAtMs: 3,
    ackError: null,
    acknowledgeTrip: async () => true,
  }),
}));

vi.mock('../../../hooks/useDiagnosticsResource', () => ({
  useDiagnosticsResource: () => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() }),
}));

vi.mock('../../../hooks/useDiagnosticsTemperatures', () => ({
  useDiagnosticsTemperatures: vi.fn(() => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() })),
}));

vi.mock('../../../hooks/useMetricHistory', () => ({
  useMetricHistory: vi.fn(() => ({
    silhouette: [], series: [], domain: [0, 1], stripDomain: [0, 1], rangeKey: '3h', lastPresetKey: '3h',
    following: true, dragging: false, loading: false, error: false, mocked: false, supported: true,
    retentionDays: 7, stepSeconds: null, viewportGeneration: 0,
    setRange: vi.fn(), onBrushChange: vi.fn(), onChartDragSelect: vi.fn(), onChartWheelZoom: vi.fn(), detach: vi.fn(), backToLive: vi.fn(), retry: vi.fn(),
  })),
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
  platform?: string;
}) {
  const {
    data, loading = false, error = false, onRefresh = () => {}, onLogsCleared = () => {},
    hours = 168, date = null, onHoursChange = () => {}, onDateChange = () => {}, platform = 'windows',
  } = props;
  return render(
    <ToastProvider>
      <IncidentsSection
        data={data} loading={loading} error={error} onRefresh={onRefresh} onLogsCleared={onLogsCleared}
        hours={hours} date={date} onHoursChange={onHoursChange} onDateChange={onDateChange} platform={platform}
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
  it('always renders four domain tiles in cooling/storage/memory/system order', () => {
    render(<ComponentHealthGrid components={[]} onNavigate={() => {}} />);
    const titles = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(titles).toEqual([
      'diagnostics.tab.thermals', 'diagnostics.kind.storage', 'diagnostics.kind.memory', 'diagnostics.kind.system',
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

  it('folds an alerts component into the Sensors tile as a reason, keeping four tiles', () => {
    const components: DiagnosticsComponent[] = [
      {
        id: 'alert:r1', kind: 'alerts', name: 'CPU Package', status: 'act',
        reasons: [{ code: 'sensorAlert', severity: 'act', summary: 'CPU Package above 90', detail: '' }],
      },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(4);
    expect(screen.getAllByText('CPU Package above 90').length).toBeGreaterThan(0);
  });

  it('never shows the raw reason detail: no tooltip without params, a formatted one with them', () => {
    const raw = 'cause=CPU reached its temperature limit active=False peakC=99.4';
    const base = { id: 'cooling:thermal-guard', kind: 'cooling' as const, name: 'CPU thermal guard', status: 'act' as const };
    const { rerender } = render(<ComponentHealthGrid onNavigate={() => {}} components={[
      { ...base, reasons: [{ code: 'cooling.thermalGuardTrip', severity: 'act', summary: 'Thermal guard tripped', detail: raw }] },
    ]} />);
    expect(screen.queryByRole('button', { name: 'infoTooltip.ariaLabel' })).toBeNull();
    rerender(<ComponentHealthGrid onNavigate={() => {}} components={[
      { ...base, reasons: [{
        code: 'cooling.thermalGuardTrip', severity: 'act', summary: 'Thermal guard tripped', detail: raw,
        params: { cause: 'x', active: 'false', reason: 'limit', peakC: '99.4', escalated: 'false', at: '1794378489292' },
      }] },
    ]} />);
    const trigger = screen.getByRole('button', { name: 'infoTooltip.ariaLabel' });
    fireEvent.focus(trigger);
    expect(document.body.textContent).not.toContain('active=False');
  });

  it('explains an unknown Memory tile with its reason instead of a bare Unknown', () => {
    const components: DiagnosticsComponent[] = [
      {
        id: 'memory', kind: 'memory', name: 'Memory', status: 'unknown',
        reasons: [{ code: 'memory.noHealthSource', severity: 'unknown', summary: 'Memory health cannot be read on this system', detail: 'No source here.' }],
      },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);
    expect(screen.getAllByText('Memory health cannot be read on this system').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'infoTooltip.ariaLabel' })).toBeInTheDocument();
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
    expect(screen.getByRole('radio', { name: 'diagnostics.temperature.range.24h' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'diagnostics.temperature.range.14d' })).toBeInTheDocument();
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

  it('hides the Open Event Viewer / Clear Windows event logs actions off Windows even with supported data', () => {
    renderIncidents({ data: response, platform: 'linux' });
    expect(screen.queryByRole('button', { name: 'diagnostics.incidents.openEventViewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'diagnostics.incidents.clearLogs' })).not.toBeInTheDocument();

    renderIncidents({ data: response, platform: 'macos' });
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

  it('puts the Monitor switch on its own row above the section header, like the Memory tab', () => {
    renderSystem(baseData);
    const sw = screen.getByRole('switch', { name: 'diagnostics.monitorComponent.system' });
    const header = screen.getByText('diagnostics.system.pnpProblems');
    expect(sw.closest('[class*="sectionHeaderRow"]')).not.toBe(header.closest('[class*="sectionHeaderRow"]'));
    expect(sw.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers Open Device Manager whether or not there are problems', () => {
    const { unmount } = renderSystem(baseData);
    expect(screen.getByRole('button', { name: 'diagnostics.system.openDeviceManager' })).toBeInTheDocument();
    unmount();

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

  // A drive without SMART support: the service sends every reading as null.
  it('StorageSection falls back to "-" for a drive with no SMART readings', () => {
    const data: DiagnosticsSmartResponse = {
      supported: true,
      drives: [{
        id: 'storage:a', name: 'USB Stick', serial: 'SN1', bus: 'usb', sizeBytes: null, temperatureC: null,
        powerOnHours: null, powerCycles: null, healthPercent: null, status: 'unknown', statusReasons: [],
        attributes: [], nvme: null,
      }],
    };
    render(<StorageSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('USB Stick')).toBeInTheDocument();
    // Guarded, so no "0 B" for size and no "nullh" / "null" for the counters.
    expect(screen.getByText('diagnostics.storage.size').nextSibling).toHaveTextContent('-');
    expect(screen.getByText('diagnostics.storage.powerOnHours').nextSibling).toHaveTextContent('-');
    expect(screen.getByText('diagnostics.storage.powerCycles').nextSibling).toHaveTextContent('-');
    expect(screen.queryByText('0 B')).not.toBeInTheDocument();
    expect(screen.queryByText('nullh')).not.toBeInTheDocument();
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

  it('MemorySection has no monitor switch and always shows the meta row and test action', () => {
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

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText(/diagnostics\.memory\.lastTest/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'diagnostics.memory.runTest' })).toBeInTheDocument();
  });

  // A DIMM reporting every field as unknown: the parser emits null for each.
  it('MemorySection falls back to "-" for module fields the SMBIOS record omits', () => {
    const data: DiagnosticsMemoryResponse = {
      supported: true,
      modules: [{ slot: 'DIMM_A1', sizeBytes: null, maxSpeedMts: null, configuredSpeedMts: null, manufacturer: null, partNumber: null }],
      xmpLikelyActive: null, lastTest: null, testScheduled: false,
    };
    render(
      <ToastProvider>
        <MemorySection data={data} loading={false} error={false} onRefresh={() => {}} />
      </ToastProvider>,
    );

    // Guarded, so no "null MT/s" and no "0 B" for a size the parser never read.
    expect(screen.getAllByRole('cell').map(c => c.textContent)).toEqual(['DIMM_A1', '-', '-', '-', '-']);
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

  // SystemSection sits beside IncidentCounts (or alone) in the System tab; an
  // unsupported platform (e.g. macOS/Linux PnP problems) renders nothing
  // rather than a redundant "not available" box.
  it('SystemSection renders nothing (not the "not available" note) when unsupported', () => {
    const data: DiagnosticsSystemResponse = { supported: false, pnpProblems: [], counts30d: zeroCounts };
    const { container } = renderSystem(data);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('diagnostics.notAvailable')).not.toBeInTheDocument();
  });
});

describe('SystemTab platform gating', () => {
  const systemData: DiagnosticsSystemResponse = { supported: true, pnpProblems: [], counts30d: zeroCounts };

  function renderSystemTab(platform: string) {
    return render(
      <ToastProvider>
        <SystemTab
          platform={platform}
          system={{ data: systemData, loading: false, error: false, refresh: () => {} }}
          incidents={{ data: null, loading: false, error: false, refresh: () => {} }}
          onLogsCleared={() => {}}
          incidentHours={168}
          incidentDate={null}
          onIncidentHoursChange={() => {}}
          onIncidentDateChange={() => {}}
        />
      </ToastProvider>,
    );
  }

  // The 30-day counters (WHEA/bugchecks/dirty shutdowns/disk/TDRs/app
  // crashes) are Windows-only incident kinds - elsewhere they'd only ever
  // read zero, so the whole block is hidden rather than shown as zeros.
  it('shows the Last 30 days counters on windows', () => {
    renderSystemTab('windows');
    expect(screen.getByText('diagnostics.system.counts.title')).toBeInTheDocument();
  });

  it('hides the Last 30 days counters off windows', () => {
    renderSystemTab('linux');
    expect(screen.queryByText('diagnostics.system.counts.title')).not.toBeInTheDocument();

    renderSystemTab('macos');
    expect(screen.queryByText('diagnostics.system.counts.title')).not.toBeInTheDocument();
  });
});

describe('DiagnosticsView tabs', () => {
  beforeEach(() => {
    mockHealth = null;
  });

  function renderDiagnosticsView(props: { tab: string | null; onTabChange: (tab: string) => void; platform?: string }) {
    return render(
      <ToastProvider>
        <DiagnosticsView
          serviceOnline={true} connectionState="online" platform={props.platform ?? ''}
          tab={props.tab} onTabChange={props.onTabChange}
        />
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

  it('redirects a legacy settings url to the Summary tab and corrects the url', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'settings', onTabChange });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.summary/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /diagnostics.tab.settings/ })).not.toBeInTheDocument();
    expect(onTabChange).toHaveBeenCalledWith('summary');
  });

  it('does not list the Watchlist on the Summary, and a card with no faults leads with its count', () => {
    mockHealth = { generatedAt: new Date().toISOString(), supported: true, overall: 'ok', components: [] };
    mockAlerts.rules = [{
      id: 'r1', enabled: true, severity: 'act', low: null, high: 90,
      sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
    }];
    mockAlerts.states = [{ ruleId: 'r1', state: 'ok', value: 50, since: null, extreme: null, direction: null, acknowledged: false }];
    renderDiagnosticsView({ tab: null, onTabChange: vi.fn() });

    expect(screen.queryByRole('button', { name: /CPU Package/ })).toBeNull();
    expect(screen.getByText('diagnostics.summary.count.sensors.one')).toBeInTheDocument();
    mockAlerts.rules = [];
    mockAlerts.states = [];
  });

  it('Dismiss on a Thermals tab banner acknowledges the alert and force-refreshes health', async () => {
    mockHealth = { generatedAt: new Date().toISOString(), supported: true, overall: 'ok', components: [] };
    mockAlerts.rules = [{
      id: 'r1', enabled: true, severity: 'act', low: null, high: 90,
      sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
    }];
    mockAlerts.states = [{ ruleId: 'r1', state: 'active', value: 95, since: null, extreme: 96, direction: 'above', acknowledged: false }];
    mockRefreshHealth.mockClear();
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    fireEvent.click(screen.getByTestId('sensor-banner-dismiss'));
    await waitFor(() => expect(mockRefreshHealth).toHaveBeenCalledWith({ force: true }));
    expect(mockAlerts.acknowledge).toHaveBeenCalledWith('r1');
    mockAlerts.rules = [];
    mockAlerts.states = [];
  });

  it('grades the Thermals tile by alert components and names the alerting sensor instead of All in range', () => {
    mockHealth = {
      generatedAt: new Date().toISOString(), supported: true, overall: 'act',
      components: [{
        id: 'alert:r1', kind: 'alerts', name: 'CPU Package', status: 'act',
        reasons: [{ code: 'sensorAlert', severity: 'act', summary: 'CPU Package above 90', detail: '' }],
      }],
    };
    mockAlerts.rules = [{
      id: 'r1', enabled: true, severity: 'act', low: null, high: 90,
      sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
    }];
    mockAlerts.states = [{ ruleId: 'r1', state: 'active', value: 95, since: null, extreme: 96, direction: 'above', acknowledged: false }];
    try {
      renderDiagnosticsView({ tab: null, onTabChange: vi.fn() });
      expect(screen.queryByText('diagnostics.summary.sensors.allInRange')).toBeNull();
      expect(screen.getAllByText('CPU Package above 90').length).toBeGreaterThan(0);
      expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(4);
      expect(screen.getAllByText('diagnostics.status.act')).toHaveLength(2);
    } finally {
      mockAlerts.rules = [];
      mockAlerts.states = [];
    }
  });

  it('hides the sensor alerts list when no rules exist', () => {
    mockHealth = { generatedAt: new Date().toISOString(), supported: true, overall: 'ok', components: [] };
    renderDiagnosticsView({ tab: null, onTabChange: vi.fn() });
    expect(screen.queryByText('diagnostics.alerts.title')).toBeNull();
  });

  it('redirects a legacy ?tab=gpu deep link to the Thermals tab', () => {
    renderDiagnosticsView({ tab: 'gpu', onTabChange: vi.fn() });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.thermals/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Thermals tab for a watchlist deep link and leaves the route alone', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'cooling:missing', onTabChange });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.thermals/ })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('redirects a legacy ?tab=sensors deep link to the Thermals tab and corrects the url', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'sensors', onTabChange });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.thermals/ })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).toHaveBeenCalledWith('cooling');
  });

  it('shows the temperature chart and watchlist on one Thermals page, with no fans section and no GPU card', () => {
    mockAlerts.rules = [{
      id: 'builtin:cpu-temp', enabled: true, severity: 'watch', low: null, high: 90, builtIn: 'cpuTemp',
      sensor: { category: 'builtin', id: 'cpu-temp', name: 'CPU', type: 'Temperature', parentName: '' },
    }];
    try {
      renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });
      expect(screen.getByText('diagnostics.temperature.title')).toBeInTheDocument();
      expect(screen.getByTestId('sensor-row')).toBeInTheDocument();
      expect(screen.queryByText('diagnostics.cooling.fansTitle')).not.toBeInTheDocument();
      expect(screen.queryByText('diagnostics.gpu.throttle.title')).not.toBeInTheDocument();
    } finally {
      mockAlerts.rules = [];
    }
  });

  it('dismissing a thermal guard trip force-refreshes the health overview', async () => {
    mockGuardTrip.on = true;
    mockRefreshHealth.mockClear();
    try {
      renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });
      fireEvent.click(await screen.findByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
      await waitFor(() => expect(mockRefreshHealth).toHaveBeenCalledWith({ force: true }));
    } finally {
      mockGuardTrip.on = false;
    }
  });

  it('deep-links straight into a domain tab from the url param', () => {
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.thermals/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('diagnostics.temperature.title')).toBeInTheDocument();
  });

  it('clicking a tab reports the new tab key to onTabChange', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: null, onTabChange });

    fireEvent.click(screen.getByRole('tab', { name: /diagnostics.kind.memory/ }));

    expect(onTabChange).toHaveBeenCalledWith('memory', expect.anything());
  });

  it('shows every tab on windows and on an unknown platform', () => {
    for (const platform of ['windows', '']) {
      const { unmount } = renderDiagnosticsView({ tab: null, onTabChange: vi.fn(), platform });
      expect(screen.getAllByRole('tab').map(el => el.textContent)).toEqual([
        'diagnostics.tab.summary', 'diagnostics.tab.thermals', 'diagnostics.kind.storage',
        'diagnostics.kind.memory', 'diagnostics.kind.system',
      ]);
      unmount();
    }
  });

  it('hides the Memory tab on linux', () => {
    renderDiagnosticsView({ tab: null, onTabChange: vi.fn(), platform: 'linux' });

    expect(screen.getAllByRole('tab').map(el => el.textContent)).toEqual([
      'diagnostics.tab.summary', 'diagnostics.tab.thermals',
      'diagnostics.kind.storage', 'diagnostics.kind.system',
    ]);
  });

  it('keeps only Summary and Thermals on macos', () => {
    renderDiagnosticsView({ tab: null, onTabChange: vi.fn(), platform: 'macos' });

    expect(screen.getAllByRole('tab').map(el => el.textContent)).toEqual([
      'diagnostics.tab.summary', 'diagnostics.tab.thermals',
    ]);
  });

  it('falls back to Summary and corrects the url when a deep link opens a platform-hidden tab', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'memory', onTabChange, platform: 'linux' });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.summary/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /diagnostics.kind.memory/ })).not.toBeInTheDocument();
    expect(onTabChange).toHaveBeenCalledWith('summary');
  });

  it('does not correct the url for a plain unrecognized tab key even on a restricted platform', () => {
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: 'not-a-real-tab', onTabChange, platform: 'macos' });

    expect(screen.getByRole('tab', { name: /diagnostics.tab.summary/ })).toHaveAttribute('aria-selected', 'true');
    expect(onTabChange).not.toHaveBeenCalled();
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

    // "diagnostics.tab.thermals" also labels the Thermals tab button (no
    // I18nProvider means both resolve to the same raw key) - target the tile's
    // own heading specifically.
    fireEvent.click(screen.getByRole('heading', { level: 4, name: 'diagnostics.tab.thermals' }));

    expect(onTabChange).toHaveBeenCalledWith('cooling');
  });

  it('fetches the Cooling chart\'s sustained-high-temperature episodes with a fixed 7-day window, regardless of tab', () => {
    const temperaturesSpy = vi.mocked(useDiagnosticsTemperatures);
    temperaturesSpy.mockClear();
    renderDiagnosticsView({ tab: 'memory', onTabChange: vi.fn() });

    expect(temperaturesSpy.mock.calls.at(-1)?.[1]).toEqual({ hours: 168 });
  });

  it('enables useMetricHistory with the cooling series query only while the Cooling tab is active', () => {
    const historySpy = vi.mocked(useMetricHistory);
    historySpy.mockClear();
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    expect(historySpy.mock.calls.at(-1)).toEqual([true, COOLING_HISTORY_SERIES_QUERY]);
  });

  it('disables useMetricHistory (empty series query) when the Cooling tab is not active', () => {
    const historySpy = vi.mocked(useMetricHistory);
    historySpy.mockClear();
    renderDiagnosticsView({ tab: 'memory', onTabChange: vi.fn() });

    expect(historySpy.mock.calls.at(-1)).toEqual([false, '']);
  });
});
