import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { IncidentsSection } from './IncidentsSection';
import { StorageSection } from './StorageSection';
import { MemorySection } from './MemorySection';
import { GpuSection } from './GpuSection';
import { CoolingSection } from './CoolingSection';
import { SystemSection } from './SystemSection';
import { ToastProvider } from '../../common/Toast/Toast';
import type {
  DiagnosticsComponent,
  DiagnosticsIncident,
  DiagnosticsIncidentsResponse,
  DiagnosticsSystemResponse,
} from '../../../api/diagnostics';

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

    render(<ComponentHealthGrid components={components} />);

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

    render(<ComponentHealthGrid components={components} />);

    expect(screen.getByText('diagnostics.status.ok')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('orders cards to storage, memory, gpu, cooling, system regardless of server order', () => {
    const components: DiagnosticsComponent[] = [
      { id: 'system:host', kind: 'system', name: 'System', status: 'ok', reasons: [] },
      { id: 'gpu:0', kind: 'gpu', name: 'GPU Model', status: 'ok', reasons: [] },
      { id: 'storage:a', kind: 'storage', name: 'Drive A', status: 'ok', reasons: [] },
    ];

    render(<ComponentHealthGrid components={components} />);

    const titles = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(titles).toEqual(['diagnostics.kind.storage', 'diagnostics.kind.gpu', 'diagnostics.kind.system']);
  });

  it('scrolls the matching section into view when a card is clicked', () => {
    const section = document.createElement('section');
    section.id = 'diagnostics-section-gpu';
    document.body.appendChild(section);
    const scrollSpy = vi.spyOn(section, 'scrollIntoView').mockImplementation(() => {});

    const components: DiagnosticsComponent[] = [
      { id: 'gpu:0', kind: 'gpu', name: 'GPU Model', status: 'ok', reasons: [] },
    ];
    render(<ComponentHealthGrid components={components} />);

    fireEvent.click(screen.getByText('diagnostics.kind.gpu'));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    section.remove();
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
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('Corrected PCIe hardware error')).toBeInTheDocument();
    expect(screen.getByText('cyberpunk2077.exe crashed')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.repeatCount')).toBeInTheDocument();
    // Detail/app info/game badge stay hidden until a row is expanded.
    expect(screen.queryByText('diagnostics.incidents.game')).not.toBeInTheDocument();
    expect(screen.queryByText('Exception code c0000005 in nvwgf2umx.dll.')).not.toBeInTheDocument();
  });

  it('reveals detail, app info, and the game badge when a row is expanded', () => {
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

    fireEvent.click(screen.getByText('cyberpunk2077.exe crashed'));

    expect(screen.getByText('diagnostics.incidents.game')).toBeInTheDocument();
    expect(screen.getByText('Exception code c0000005 in nvwgf2umx.dll.')).toBeInTheDocument();
    expect(screen.getByText(/cyberpunk2077\.exe - D:\/Games\/Cyberpunk2077\.exe/)).toBeInTheDocument();
  });

  it('shows the first-seen time for a repeated incident once expanded', () => {
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

    fireEvent.click(screen.getByText('Corrected PCIe hardware error'));

    expect(screen.getByText('diagnostics.incidents.firstSeen')).toBeInTheDocument();
  });

  it('does not make a row with nothing to expand keyboard-interactive', () => {
    const singleton: DiagnosticsIncidentsResponse = {
      supported: true,
      windowDays: 30,
      incidents: [makeIncident({ id: 'System/1', timeUtc: '2026-07-06T23:54:42Z', source: 'whea', title: 'Corrected PCIe hardware error' })],
    };
    render(<IncidentsSection data={singleton} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.queryByRole('button', { name: /Corrected PCIe hardware error/ })).not.toBeInTheDocument();
  });

  it('narrows the list to one source when its filter chip is clicked', () => {
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

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
    render(<IncidentsSection data={bigResponse} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('WHEA event 0')).toBeInTheDocument();
    expect(screen.queryByText('WHEA event 19')).toBeInTheDocument();
    expect(screen.queryByText('WHEA event 20')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.shownOfTotal')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.showMore')).toBeInTheDocument();
  });

  it('reveals the rest and hides the button once everything is shown', () => {
    render(<IncidentsSection data={bigResponse} loading={false} error={false} onRefresh={() => {}} />);

    fireEvent.click(screen.getByText('diagnostics.incidents.showMore'));

    expect(screen.getByText('App crash 4')).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.showMore')).not.toBeInTheDocument();
  });

  it('filters first, then paginates the narrowed set', () => {
    render(<IncidentsSection data={bigResponse} loading={false} error={false} onRefresh={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.source.appCrash' }));

    // Only 5 appCrash incidents - under the page size, so no pager at all.
    for (let i = 0; i < 5; i++) expect(screen.getByText(`App crash ${i}`)).toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.showMore')).not.toBeInTheDocument();
    expect(screen.queryByText('diagnostics.incidents.shownOfTotal')).not.toBeInTheDocument();
  });
});

describe('section refresh buttons', () => {
  it('force-refreshes storage, memory, gpu, and system', () => {
    const onRefresh = vi.fn();
    render(<StorageSection data={null} loading={false} error={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.refresh' }));
    expect(onRefresh).toHaveBeenCalledWith({ force: true });
  });

  it('force-refreshes memory', () => {
    const onRefresh = vi.fn();
    // MemorySection's schedule/cancel-test toasts need a ToastProvider ancestor.
    render(<ToastProvider><MemorySection data={null} loading={false} error={false} onRefresh={onRefresh} /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.refresh' }));
    expect(onRefresh).toHaveBeenCalledWith({ force: true });
  });

  it('force-refreshes gpu', () => {
    const onRefresh = vi.fn();
    render(<GpuSection data={null} loading={false} error={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.refresh' }));
    expect(onRefresh).toHaveBeenCalledWith({ force: true });
  });

  it('force-refreshes system', () => {
    const onRefresh = vi.fn();
    render(<SystemSection data={null} loading={false} error={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.refresh' }));
    expect(onRefresh).toHaveBeenCalledWith({ force: true });
  });

  it('refreshes cooling without a force option (endpoint has no server cache to bust)', () => {
    const onRefresh = vi.fn();
    render(<CoolingSection data={null} loading={false} error={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.refresh' }));
    expect(onRefresh).toHaveBeenCalledWith();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner on the refresh button while a section is loading', () => {
    render(<SystemSection data={null} loading error={false} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: 'diagnostics.refresh' })).toHaveAttribute('data-loading', 'true');
  });
});

describe('SystemSection PnP problem mapping', () => {
  const baseData: DiagnosticsSystemResponse = {
    supported: true,
    pnpProblems: [],
    counts30d: { whea: 0, bugchecks: 0, dirtyShutdowns: 0, diskErrors: 0, tdrs: 0, gpuDriverErrors: 0, appCrashes: 0 },
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
