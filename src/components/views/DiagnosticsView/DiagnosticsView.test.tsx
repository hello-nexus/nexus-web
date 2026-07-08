import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { IncidentsSection } from './IncidentsSection';
import type { DiagnosticsComponent, DiagnosticsIncidentsResponse } from '../../../api/diagnostics';

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

    expect(screen.getByText('diagnostics.status.act')).toBeInTheDocument();
    // No I18nProvider in this test, so t() returns the raw key; reasonLabel's
    // fallback then correctly prefers the server summary over the unresolved
    // key (see diagnosticsHelpers.test.ts for the fallback logic itself).
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
});

describe('IncidentsSection', () => {
  const response: DiagnosticsIncidentsResponse = {
    supported: true,
    windowDays: 30,
    incidents: [
      {
        id: 'System/1',
        timeUtc: '2026-07-06T23:54:42Z',
        source: 'whea',
        severity: 'warning',
        title: 'Corrected PCIe hardware error',
        detail: '',
        app: null,
        data: {},
      },
      {
        id: 'Application/2',
        timeUtc: '2026-07-05T20:12:03Z',
        source: 'appCrash',
        severity: 'critical',
        title: 'cyberpunk2077.exe crashed',
        detail: '',
        app: {
          name: 'cyberpunk2077.exe',
          path: 'D:/Games/Cyberpunk2077.exe',
          exceptionCode: 'c0000005',
          faultingModule: 'nvwgf2umx.dll',
          isGame: true,
        },
        data: {},
      },
    ],
  };

  it('shows every incident with the all filter', () => {
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

    expect(screen.getByText('Corrected PCIe hardware error')).toBeInTheDocument();
    expect(screen.getByText('cyberpunk2077.exe crashed')).toBeInTheDocument();
    expect(screen.getByText('diagnostics.incidents.game')).toBeInTheDocument();
  });

  it('narrows the list to one source when its filter chip is clicked', () => {
    render(<IncidentsSection data={response} loading={false} error={false} onRefresh={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.incidents.source.appCrash' }));

    expect(screen.getByText('cyberpunk2077.exe crashed')).toBeInTheDocument();
    expect(screen.queryByText('Corrected PCIe hardware error')).not.toBeInTheDocument();
  });
});
