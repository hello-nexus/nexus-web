import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProcessDetailPanel, type ProcessDetailPanelProps } from './ProcessDetailPanel';
import type { UseMonitoringProcessInfoResult } from '../../../../hooks/useMonitoringProcessInfo';
import type { ProcessDetailUsage } from '../../../../hooks/useProcessDetailUsage';
import type { UseMetricHistoryAppsResult } from '../../../../hooks/useMetricHistoryApps';
import type { AppWindowPoint } from '../../../../api/monitoringHistoryApps';
import type { ProcessInfoResponse } from '../../../../api/monitoringProcessInfo';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: () => null,
}));

const infoMock = vi.fn<() => UseMonitoringProcessInfoResult>();
vi.mock('../../../../hooks/useMonitoringProcessInfo', () => ({
  useMonitoringProcessInfo: () => infoMock(),
}));

const usageMock = vi.fn<() => ProcessDetailUsage>();
vi.mock('../../../../hooks/useProcessDetailUsage', () => ({
  useProcessDetailUsage: () => usageMock(),
}));

function emptyAppsResult(): UseMetricHistoryAppsResult {
  return { apps: [], loading: false, supported: true, mocked: false, ready: true };
}

function emptyUsage(): ProcessDetailUsage {
  return {
    cpu: emptyAppsResult(), memory: emptyAppsResult(), gpu: emptyAppsResult(), vram: emptyAppsResult(),
  };
}

function usageWithPoints(over: Partial<Record<keyof ProcessDetailUsage, readonly AppWindowPoint[]>>, name = 'chrome.exe'): ProcessDetailUsage {
  const base = emptyUsage();
  const result: ProcessDetailUsage = { ...base };
  for (const key of Object.keys(over) as (keyof ProcessDetailUsage)[]) {
    result[key] = { ...emptyAppsResult(), apps: [{ name, avg: 0, max: 0, points: [...over[key]!] }] };
  }
  return result;
}

const killMock = vi.fn();
const openLocationMock = vi.fn();
vi.mock('../../../../api/monitoringProcessActions', () => ({
  killMonitoringProcess: (name: string) => killMock(name),
  openMonitoringProcessLocation: (name: string) => openLocationMock(name),
}));

const pushMock = vi.fn();
vi.mock('../../../../components/common/Toast/Toast', () => ({
  useToastSafe: () => ({ push: pushMock }),
}));

function infoResult(over: Partial<UseMonitoringProcessInfoResult> = {}): UseMonitoringProcessInfoResult {
  return { data: null, loading: true, error: false, mocked: false, supported: true, ...over };
}

function fullData(over: Partial<ProcessInfoResponse> = {}): ProcessInfoResponse {
  return {
    supported: true,
    name: 'chrome.exe',
    path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    instanceCount: 3,
    startedAtMs: Date.now() - 1000,
    description: 'Google Chrome',
    version: '124.0.1',
    company: 'Google LLC',
    publisher: 'Google LLC',
    signed: true,
    sha256: 'abc123',
    createdAtMs: Date.now() - 10_000,
    modifiedAtMs: Date.now() - 5_000,
    firstSeenMs: Date.now() - 20_000,
    ...over,
  };
}

const NOW = Date.now();

function baseProps(over: Partial<ProcessDetailPanelProps> = {}): ProcessDetailPanelProps {
  return {
    onClose: vi.fn(),
    name: 'chrome.exe',
    live: undefined,
    appsWindow: undefined,
    valueFormat: (v: number) => `${v}%`,
    privacySessions: [],
    privacySupported: true,
    selectedFrameMs: NOW,
    following: true,
    historyFrom: NOW - 1_800_000,
    historyTo: NOW,
    ...over,
  };
}

beforeEach(() => {
  killMock.mockReset();
  openLocationMock.mockReset();
  pushMock.mockReset();
  infoMock.mockReturnValue(infoResult());
  usageMock.mockReturnValue(emptyUsage());
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe('ProcessDetailPanel header', () => {
  it('shows the raw process name before process info resolves', () => {
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
  });

  it('shows the friendly description, instance count, and publisher once loaded', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailPanel {...baseProps()} />);
    // "Google Chrome" (the description) and "Google LLC" (the publisher)
    // each legitimately render twice: once in the header meta line, once
    // again in the info block's own rows - both are correct, so assert on
    // both occurrences, not exactly one.
    expect(screen.getAllByText('Google Chrome').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Google LLC/).length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProcessDetailPanel actions', () => {
  it('opens a confirm dialog before killing the process', () => {
    render(<ProcessDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    expect(screen.getByText('monitoring.processDetail.kill.confirmTitle')).toBeInTheDocument();
    expect(killMock).not.toHaveBeenCalled();
  });

  it('Esc with the kill confirm open closes only the confirm dialog - the panel has no Escape handling of its own', () => {
    const onClose = vi.fn();
    render(<ProcessDetailPanel {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    expect(screen.getByText('monitoring.processDetail.kill.confirmTitle')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('monitoring.processDetail.kill.confirmTitle')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('monitoring.processDetail.actions.kill')).toBeInTheDocument();

    // A second Esc has nothing left to close (the panel is an inline column,
    // not a dismissible modal) - onClose still never fires.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has no dialog/scrim role - it renders as a plain in-flow panel, not a modal', () => {
    const { container } = render(<ProcessDetailPanel {...baseProps()} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[aria-modal="true"]')).toBeNull();
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    render(<ProcessDetailPanel {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'app.window.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kills the process, shows a toast, and closes on confirm success', async () => {
    killMock.mockResolvedValue({ error: false, msg: 'ok' });
    const onClose = vi.fn();
    render(<ProcessDetailPanel {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    fireEvent.click(screen.getByText('monitoring.processDetail.kill.confirmButton'));

    await waitFor(() => expect(killMock).toHaveBeenCalledWith('chrome.exe'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalled();
  });

  it('shows an inline error and keeps the dialog open on kill failure', async () => {
    killMock.mockResolvedValue({ error: true, msg: 'Access denied' });
    const onClose = vi.fn();
    render(<ProcessDetailPanel {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    fireEvent.click(screen.getByText('monitoring.processDetail.kill.confirmButton'));

    await screen.findByText('Access denied');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the file location and toasts on failure', async () => {
    openLocationMock.mockResolvedValue(null);
    render(<ProcessDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText('monitoring.processDetail.actions.openLocation'));

    await waitFor(() => expect(openLocationMock).toHaveBeenCalledWith('chrome.exe'));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});

describe('ProcessDetailPanel live usage tiles', () => {
  it('shows the unavailable note when there is no live data', () => {
    render(<ProcessDetailPanel {...baseProps({ live: undefined })} />);
    expect(screen.getByText('monitoring.processDetail.live.unavailable')).toBeInTheDocument();
  });

  it('renders a tile per known live metric, omitting gpu/vram when absent', () => {
    render(<ProcessDetailPanel {...baseProps({ live: { cpuPercent: 12, memoryMb: 512 } })} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('512 MB')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.processDetail.live.gpu')).toBeNull();
    expect(screen.queryByText('monitoring.processDetail.live.vram')).toBeNull();
  });

  it('renders gpu and vram tiles when present', () => {
    render(<ProcessDetailPanel {...baseProps({ live: { cpuPercent: 1, memoryMb: 2, gpuPercent: 34, vramMb: 900 } })} />);
    expect(screen.getByText('monitoring.processDetail.live.gpu')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('900 MB')).toBeInTheDocument();
  });
});

describe('ProcessDetailPanel usage tiles at the selected frame', () => {
  it('shows the value at the selected frame from the per-process window fetch, not the live value', () => {
    usageMock.mockReturnValue(usageWithPoints({ cpu: [{ t: NOW - 1000, avg: 10 }, { t: NOW, avg: 77 }] }));
    render(<ProcessDetailPanel {...baseProps({
      live: { cpuPercent: 1 }, following: false, selectedFrameMs: NOW,
    })} />);
    expect(screen.getByText('77%')).toBeInTheDocument();
    expect(screen.queryByText('1%')).toBeNull();
  });

  it('falls back to the live value when the window series has no points yet', () => {
    usageMock.mockReturnValue(emptyUsage());
    render(<ProcessDetailPanel {...baseProps({
      live: { cpuPercent: 9 }, following: false, selectedFrameMs: NOW,
    })} />);
    expect(screen.getByText('9%')).toBeInTheDocument();
  });

  it('reads each metric from its own fetched series independently', () => {
    usageMock.mockReturnValue(usageWithPoints({
      cpu: [{ t: NOW, avg: 5 }],
      memory: [{ t: NOW, avg: 256 }],
      gpu: [{ t: NOW, avg: 15 }],
      vram: [{ t: NOW, avg: 700 }],
    }));
    render(<ProcessDetailPanel {...baseProps({ following: false, selectedFrameMs: NOW })} />);
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('256 MB')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('700 MB')).toBeInTheDocument();
  });
});

describe('ProcessDetailPanel timeframe label', () => {
  it('shows the Live badge while following', () => {
    render(<ProcessDetailPanel {...baseProps({ following: true })} />);
    expect(screen.getByText('monitoring.history.live')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.processDetail.timeframe.asOf')).toBeNull();
  });

  it('shows the as-of label with the selected frame instead of Live while scrubbed', () => {
    render(<ProcessDetailPanel {...baseProps({ following: false, selectedFrameMs: NOW - 60_000 })} />);
    expect(screen.getByText('monitoring.processDetail.timeframe.asOf')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.history.live')).toBeNull();
  });

  it('shows as-of, not Live, when a frame is pinned even though the viewport is still following (a plain chart click, no drag)', () => {
    // A click on the hero chart pins selectedFrameMs without ever flipping
    // `following` (see TimeSeriesChart's onPointClick vs onRangeSelect) -
    // historyTo (the domain's own right edge) stays at its baseProps default
    // (NOW) while selectedFrameMs moves to the clicked past instant.
    render(<ProcessDetailPanel {...baseProps({ following: true, selectedFrameMs: NOW - 60_000 })} />);
    expect(screen.getByText('monitoring.processDetail.timeframe.asOf')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.history.live')).toBeNull();
  });
});

describe('ProcessDetailPanel usage chart', () => {
  it('shows an unsupported note when the apps-window route is unsupported', () => {
    render(<ProcessDetailPanel {...baseProps({ appsWindow: { apps: [], loading: false, supported: false, mocked: false, ready: true } })} />);
    expect(screen.getByText('monitoring.processDetail.chart.unsupported')).toBeInTheDocument();
  });

  it('shows a no-data note when supported but this app has no series in the window', () => {
    render(<ProcessDetailPanel {...baseProps({ appsWindow: { apps: [], loading: false, supported: true, mocked: false, ready: true } })} />);
    expect(screen.getByText('monitoring.processDetail.chart.noData')).toBeInTheDocument();
  });

  it('shows the no-data note, not the unsupported note, while the first window fetch is still in flight', () => {
    render(<ProcessDetailPanel {...baseProps({ appsWindow: { apps: [], loading: true, supported: true, mocked: false, ready: false } })} />);
    expect(screen.getByText('monitoring.processDetail.chart.noData')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.processDetail.chart.unsupported')).toBeNull();
  });

  it('renders the mini chart and avg/max when this app has window data', () => {
    const appsWindow = {
      apps: [{ name: 'chrome.exe', avg: 20, max: 40, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 30 }] }],
      loading: false, supported: true, mocked: false, ready: true,
    };
    render(<ProcessDetailPanel {...baseProps({ appsWindow, valueFormat: v => `${v}%` })} />);
    expect(screen.queryByText('monitoring.processDetail.chart.noData')).toBeNull();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });
});

describe('ProcessDetailPanel info section', () => {
  it('shows an unsupported note when the route predates process-info', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, supported: false }));
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.unsupported')).toBeInTheDocument();
  });

  it('shows an error note on a real fetch failure', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, error: true, data: null }));
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.error')).toBeInTheDocument();
  });

  it('renders version/description/path/sha256/dates once loaded', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.getByText('124.0.1')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('shows an Unsigned badge only when the binary is unsigned', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData({ signed: false }) }));
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.unsigned')).toBeInTheDocument();
  });

  it('shows no Unsigned badge for a signed binary', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData({ signed: true }) }));
    render(<ProcessDetailPanel {...baseProps()} />);
    expect(screen.queryByText('monitoring.processDetail.info.unsigned')).toBeNull();
  });

  it('copies the path to the clipboard when the copy button is pressed', async () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailPanel {...baseProps()} />);

    // The path and sha256 copy buttons carry distinct aria-labels (the
    // field's own label appended) so they're each individually addressable.
    const pathCopyButton = screen.getByRole('button', {
      name: 'monitoring.processDetail.copy monitoring.processDetail.info.path',
    });
    fireEvent.click(pathCopyButton);

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fullData().path));
  });

  it('gives the path and sha256 copy buttons distinct labels', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailPanel {...baseProps()} />);

    expect(screen.getByRole('button', { name: 'monitoring.processDetail.copy monitoring.processDetail.info.path' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'monitoring.processDetail.copy monitoring.processDetail.info.sha256' })).toBeInTheDocument();
  });
});

describe('ProcessDetailPanel privacy section', () => {
  it('hides the section entirely when there are no matching sessions', () => {
    render(<ProcessDetailPanel {...baseProps({ privacySessions: [] })} />);
    expect(screen.queryByText('monitoring.processDetail.privacy.title')).toBeNull();
  });

  it('hides the section when privacy is unsupported, even with sessions passed in', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: Date.now() - 1000, end: null }];
    render(<ProcessDetailPanel {...baseProps({ privacySessions: sessions, privacySupported: false })} />);
    expect(screen.queryByText('monitoring.processDetail.privacy.title')).toBeNull();
  });

  it('renders this process\'s own sessions with capability and time', () => {
    const sessions: PrivacySession[] = [
      { app: 'C:\\chrome.exe', capability: 'webcam', start: Date.now() - 1000, end: null },
      { app: 'C:\\other.exe', capability: 'microphone', start: Date.now() - 2000, end: Date.now() - 500 },
    ];
    render(<ProcessDetailPanel {...baseProps({ privacySessions: sessions })} />);
    expect(screen.getByText('monitoring.processDetail.privacy.title')).toBeInTheDocument();
    expect(screen.getByText('monitoring.privacy.capability.webcam')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.privacy.capability.microphone')).toBeNull();
  });
});
