import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { CoolingSection } from './CoolingSection';
import { DiagnosticsView } from './DiagnosticsView';
import { GpuSection } from './GpuSection';
import { IncidentsSection } from './IncidentsSection';
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
// only exercise tab switching, not each section's own data rendering
// (covered by the "headerless sections" and per-section test suites).
let mockHealth: DiagnosticsHealth | null = null;

vi.mock('../../../hooks/useDiagnosticsHealth', () => ({
  useDiagnosticsHealth: () => ({ health: mockHealth, loading: false, error: false, mocked: false, refresh: vi.fn() }),
}));

vi.mock('../../../hooks/useDiagnosticsResource', () => ({
  useDiagnosticsResource: () => ({ data: null, loading: false, error: false, mocked: false, refresh: vi.fn() }),
}));

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: null }),
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

// IncidentsSection now reads useToast() unconditionally (for the Open Event
// Viewer / Clear Windows event logs actions), so every render needs a
// ToastProvider ancestor - matches MemorySection's existing precedent.
function renderIncidents(props: {
  data: DiagnosticsIncidentsResponse | null;
  loading?: boolean;
  error?: boolean;
  onRefresh?: () => void;
  onLogsCleared?: () => void;
}) {
  const { data, loading = false, error = false, onRefresh = () => {}, onLogsCleared = () => {} } = props;
  return render(
    <ToastProvider>
      <IncidentsSection data={data} loading={loading} error={error} onRefresh={onRefresh} onLogsCleared={onLogsCleared} />
    </ToastProvider>,
  );
}

describe('ComponentHealthGrid', () => {
  it('renders the act state for a component in that state', () => {
    const components: DiagnosticsComponent[] = [
      {
        id: 'cooling:hyte-q60:pump',
        kind: 'cooling',
        name: 'HYTE Q60 Pump',
        status: 'act',
        reasons: [
          {
            code: 'cooling.pumpStall',
            severity: 'act',
            summary: 'Pump RPM reads 0',
            detail: 'The pump has reported 0 RPM for more than 60 seconds.',
          },
        ],
      },
    ];

    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);

    // No I18nProvider in this test, so t() returns the raw key; reasonLabel's
    // fallback then correctly prefers the server summary over the unresolved
    // key (see diagnosticsHelpers.test.ts for the fallback logic itself).
    expect(screen.getByText('diagnostics.status.act')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.kind.cooling')).toBeInTheDocument();
    expect(screen.getByText('HYTE Q60 Pump')).toBeInTheDocument();
    expect(screen.getAllByText('Pump RPM reads 0').length).toBeGreaterThan(0);
  });

  it('renders an ok component with no reasons list', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'system:host', kind: 'system', name: 'System', status: 'ok', reasons: [] },
    ];

    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);

    expect(screen.getByText('diagnostics.status.ok')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('orders cards to storage, memory, gpu, cooling, system regardless of server order', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'system:host', kind: 'system', name: 'System', status: 'ok', reasons: [] },
      { id: 'gpu:0', kind: 'gpu', name: 'GPU Model', status: 'ok', reasons: [] },
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
    ];

    render(<ComponentHealthGrid components={components} onNavigate={() => {}} />);

    const titles = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(titles).toEqual(['diagnostics.kind.storage', 'diagnostics.kind.gpu', 'diagnostics.kind.system']);
  });

  it('navigates to the matching tab when a card is clicked', () => {
    const onNavigate = vi.fn();
    const components: DiagnosticsComponent[] = [
      { id: 'gpu:0', kind: 'gpu', name: 'GPU Model', status: 'ok', reasons: [] },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('diagnostics.kind.gpu'));

    expect(onNavigate).toHaveBeenCalledWith('gpu');
  });

  it('navigates to the matching tab via keyboard (Enter) for accessibility', () => {
    const onNavigate = vi.fn();
    const components: DiagnosticsComponent[] = [
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
    ];
    render(<ComponentHealthGrid components={components} onNavigate={onNavigate} />);

    const card = screen.getByRole('button', { name: /diagnostics.kind.storage/ });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('storage');
  });
});

function makeIncident(overrides: Partial<DiagnosticsIncident> & Pick<DiagnosticsIncident, 'id' | 'timeUtc' | 'source'>): DiagnosticsIncident {
  return {
    severity: 'info',
    title: 'Incident',
    detail: '',
    app: null,
    data: {},
    repeatCount: 1,
    firstUtc: null,
    ...overrides,
  };
}

describe('IncidentsSection', () => {
  const response: DiagnosticsIncidentsResponse = {
    supported: true,
    windowDays: 30,
    incidents: [
      makeIncident({
        id: 'System/1',
        timeUtc: '2026-07-06T23:54:42Z',
        source: 'whea',
        severity: 'warning',
        title: 'Corrected PCIe hardware error',
        repeatCount: 5,
        firstUtc: '2026-07-01T00:00:00Z',
      }),
      makeIncident({
        id: 'Application/2',
        timeUtc: '2026-07-05T20:12:03Z',
        source: 'appCrash',
        severity: 'critical',
        title: 'cyberpunk2077.exe crashed',
        detail: 'Exception code c0000005 in nvwgf2umx.dll.',
        app: {
          name: 'cyberpunk2077.exe',
          path: 'D:/Games/Cyberpunk2077.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'nvwgf2umx.dll',
          isGame: true,
        },
      }),
    ],
  };

  it('condenses every incident to one line with the all filter', () => {
    renderIncidents({ data: response });

    expect(screen.getByText('Corrected PCIe hardware error')).toBeInTheDocument();
    expect(screen.getByText('cyberpunk2077.exe crashed')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.repeatCount')).toBeInTheDocument();
    // Detail/app info/game badge stay hidden until a row is expanded.
    expect(screen.queryByText('diagnostics.incidents.game')).not.toBeInTheDocument();
    expect(screen.queryByText('Exception code c0000005 in nvwgf2umx.dll.')).not.toBeInTheDocument();
  });

  it('reveals detail, app info, and the game badge when a row is expanded', () => {
    renderIncidents({ data: response });

    fireEvent.click(screen.getByText('cyberpunk2077.exe crashed'));

    expect(screen.getByText('diagnostics.incidents.game')).toBeInTheDocument();
    expect(screen.getByText('Exception code c0000005 in nvwgf2umx.dll.')).toBeInTheDocument();
    expect(screen.getByText(/cyberpunk2077\.exe - D:\/Games\/Cyberpunk2077\.exe/)).toBeInTheDocument();
  });

  it('shows the first-seen time for a repeated incident once expanded', () => {
    renderIncidents({ data: response });

    fireEvent.click(screen.getByText('Corrected PCIe hardware error'));

    expect(screen.getByText('diagnostics.incidents.firstSeen')).toBeInTheDocument();
  });

  it('does not make a row with nothing to expand keyboard-interactive', () => {
    const singleton: DiagnosticsIncidentsResponse = {
      supported: true,
      windowDays: 30,
      incidents: [makeIncident({ id: 'System/1', timeUtc: '2026-07-06T23:54:42Z', source: 'whea', title: 'Corrected PCIe hardware error' })],
    };
    renderIncidents({ data: singleton });

    expect(screen.queryByRole('button', { name: /Corrected PCIe hardware error/ })).not.toBeInTheDocument();
  });

  it('narrows the list to one source when its filter chip is clicked', () => {
    renderIncidents({ data: response });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.source.appCrash' }));

    expect(screen.getByText('cyberpunk2077.exe crashed')).toBeInTheDocument();
    expect(screen.queryByText('Corrected PCIe hardware error')).not.toBeInTheDocument();
  });
});

describe('IncidentsSection pagination', () => {
  const wheaIncidents = Array.from({ length: 25 }, (_, i) =>
    makeIncident({ id: `whea/${i}`, timeUtc: '2026-07-06T00:00:00Z', source: 'whea', title: `WHEA event ${i}` }));
  const appCrashIncidents = Array.from({ length: 5 }, (_, i) =>
    makeIncident({ id: `crash/${i}`, timeUtc: '2026-07-06T00:00:00Z', source: 'appCrash', title: `App crash ${i}` }));
  const bigResponse: DiagnosticsIncidentsResponse = {
    supported: true,
    windowDays: 30,
    incidents: [...wheaIncidents, ...appCrashIncidents],
  };

  it('shows only the first page and a show-more control', () => {
    renderIncidents({ data: bigResponse });

    expect(screen.getByText('WHEA event 0')).toBeInTheDocument();
    expect(screen.queryByText('WHEA event 19')).toBeInTheDocument();
    expect(screen.queryByText('WHEA event 20')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.shownOfTotal')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.showMore')).toBeInTheDocument();
  });

  it('reveals the rest and hides the button once everything is shown', () => {
    renderIncidents({ data: bigResponse });

    fireEvent.click(screen.getByText('diagnostics.incidents.showMore'));

    expect(screen.getByText('App crash 4')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.showMore')).not.toBeInTheDocument();
  });

  it('filters first, then paginates the narrowed set', () => {
    renderIncidents({ data: bigResponse });

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.source.appCrash' }));

    // Only 5 appCrash incidents - under the page size, so no pager at all.
    for (let i = 0; i < 5; i++) expect(screen.getByText(`App crash ${i}`)).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.showMore')).not.toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.shownOfTotal')).not.toBeInTheDocument();
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

    // The service may have cleared one log and not the other, so both
    // sections still resync even though the overall result is a failure.
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

describe('SystemSection PnP problem mapping', () => {
  const baseData: DiagnosticsSystemResponse = {
    supported: true,
    pnpProblems: [],
    counts30d: { whea: 0, bugchecks: 0, dirtyShutdowns: 0, diskErrors: 0, tdrs: 0, appCrashes: 0 },
  };

  it('shows the mapped human explanation for a known problem code', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: 'Unknown USB Device', deviceId: 'USB\\VID_0000', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' }],
    };
    render(<SystemSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('diagnostics.system.problemCode.28')).toBeInTheDocument();
    // The raw constant/deviceId stay out of the visible row (tooltip-only).
    expect(screen.queryByText(/CM_PROB_FAILED_INSTALL/)).not.toBeInTheDocument();
  });

  it('falls back to a generic labeled line for an unmapped code', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: 'Mystery Device', deviceId: 'ACPI\\PNP0C0D', problemCode: 99, problemText: 'CM_PROB_UNKNOWN' }],
    };
    render(<SystemSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('diagnostics.system.problemCodeFallback')).toBeInTheDocument();
  });

  it('falls back to an "unknown device" label when the server sends an empty name', () => {
    const data: DiagnosticsSystemResponse = {
      ...baseData,
      pnpProblems: [{ name: '', deviceId: 'ACPI\\PNP0C0D', problemCode: 28, problemText: 'CM_PROB_FAILED_INSTALL' }],
    };
    render(<SystemSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('diagnostics.system.unknownDevice')).toBeInTheDocument();
  });
});

// The tab is the title now - each domain section renders without its own
// redundant top-level "Storage"/"Memory"/"GPU"/"Cooling"/"System" heading,
// while sub-group headers nested inside a section (NVMe health, Throttling,
// Last 30 days, Device problems) still render.
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

  it('GpuSection omits the outer "GPU" title but keeps its own Throttling sub-header', () => {
    const data: DiagnosticsGpuResponse = {
      supported: true,
      gpus: [{
        name: 'Test GPU', driverVersion: '1.0', temperatureC: 50, powerW: 100,
        throttle: { active: [], swPowerCapUs: 0, swThermalUs: 0, hwThermalUs: 0, hwPowerBrakeUs: 0 }, recentTdrCount: 0,
      }],
    };
    render(<GpuSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.queryByText('diagnostics.kind.gpu')).not.toBeInTheDocument();
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

  it('SystemSection omits the outer "System" title but keeps its own sub-headers', () => {
    const data: DiagnosticsSystemResponse = {
      supported: true,
      pnpProblems: [],
      counts30d: { whea: 0, bugchecks: 0, dirtyShutdowns: 0, diskErrors: 0, tdrs: 0, appCrashes: 0 },
    };
    render(<SystemSection data={data} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.queryByText('diagnostics.kind.system')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.system.counts.title')).toBeInTheDocument();
  });
});

describe('DiagnosticsView tabs', () => {
  beforeEach(() => {
    mockHealth = null;
  });

  // DiagnosticsView's action bar reads useToast() unconditionally (download
  // failure messages), same as MemorySection/IncidentsSection above.
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

  it('a Summary jump-off health card navigates straight to its domain tab', () => {
    mockHealth = {
      generatedAt: '2026-07-08T02:00:00Z',
      supported: true,
      overall: 'watch',
      components: [{ id: 'gpu:0', kind: 'gpu', name: 'Test GPU', status: 'watch', reasons: [] }],
    };
    const onTabChange = vi.fn();
    renderDiagnosticsView({ tab: null, onTabChange });

    // "diagnostics.kind.gpu" also labels the GPU tab button itself (no
    // I18nProvider means both resolve to the same raw key) - the health
    // card's own title renders as a heading, so target that specifically.
    fireEvent.click(screen.getByRole('heading', { level: 4, name: 'diagnostics.kind.gpu' }));

    expect(onTabChange).toHaveBeenCalledWith('gpu');
  });

  it('picking a day switches useDiagnosticsTemperatures to a date query, and clicking a range chip clears it back to hours', () => {
    const temperaturesSpy = vi.mocked(useDiagnosticsTemperatures);
    temperaturesSpy.mockClear();
    renderDiagnosticsView({ tab: 'cooling', onTabChange: vi.fn() });

    // Default range is 7d (168h).
    expect(temperaturesSpy.mock.calls.at(-1)?.[1]).toEqual({ hours: 168 });

    // The datepicker's "today" footer button is a bounds-safe way to pick a
    // valid day without computing calendar cell positions.
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
