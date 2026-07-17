import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProcessDetailSlideout, type ProcessDetailSlideoutProps } from './ProcessDetailSlideout';
import type { UseMonitoringProcessInfoResult } from '../../../../hooks/useMonitoringProcessInfo';
import type { ProcessInfoResponse } from '../../../../api/monitoringProcessInfo';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: () => null,
}));

const infoMock = vi.fn<() => UseMonitoringProcessInfoResult>();
vi.mock('../../../../hooks/useMonitoringProcessInfo', () => ({
  useMonitoringProcessInfo: () => infoMock(),
}));

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

function baseProps(over: Partial<ProcessDetailSlideoutProps> = {}): ProcessDetailSlideoutProps {
  return {
    onClose: vi.fn(),
    name: 'chrome.exe',
    live: undefined,
    appsWindow: undefined,
    valueFormat: (v: number) => `${v}%`,
    privacySessions: [],
    privacySupported: true,
    ...over,
  };
}

beforeEach(() => {
  killMock.mockReset();
  openLocationMock.mockReset();
  pushMock.mockReset();
  infoMock.mockReturnValue(infoResult());
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe('ProcessDetailSlideout header', () => {
  it('shows the raw process name before process info resolves', () => {
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
  });

  it('shows the friendly description, instance count, and publisher once loaded', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    // "Google Chrome" (the description) and "Google LLC" (the publisher)
    // each legitimately render twice: once in the header meta line, once
    // again in the info block's own rows - both are correct, so assert on
    // both occurrences, not exactly one.
    expect(screen.getAllByText('Google Chrome').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Google LLC/).length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProcessDetailSlideout actions', () => {
  it('opens a confirm dialog before killing the process', () => {
    render(<ProcessDetailSlideout {...baseProps()} />);
    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    expect(screen.getByText('monitoring.processDetail.kill.confirmTitle')).toBeInTheDocument();
    expect(killMock).not.toHaveBeenCalled();
  });

  it('kills the process, shows a toast, and closes on confirm success', async () => {
    killMock.mockResolvedValue({ error: false, msg: 'ok' });
    const onClose = vi.fn();
    render(<ProcessDetailSlideout {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    fireEvent.click(screen.getByText('monitoring.processDetail.kill.confirmButton'));

    await waitFor(() => expect(killMock).toHaveBeenCalledWith('chrome.exe'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalled();
  });

  it('shows an inline error and keeps the dialog open on kill failure', async () => {
    killMock.mockResolvedValue({ error: true, msg: 'Access denied' });
    const onClose = vi.fn();
    render(<ProcessDetailSlideout {...baseProps({ onClose })} />);

    fireEvent.click(screen.getByText('monitoring.processDetail.actions.kill'));
    fireEvent.click(screen.getByText('monitoring.processDetail.kill.confirmButton'));

    await screen.findByText('Access denied');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the file location and toasts on failure', async () => {
    openLocationMock.mockResolvedValue(null);
    render(<ProcessDetailSlideout {...baseProps()} />);
    fireEvent.click(screen.getByText('monitoring.processDetail.actions.openLocation'));

    await waitFor(() => expect(openLocationMock).toHaveBeenCalledWith('chrome.exe'));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});

describe('ProcessDetailSlideout live usage tiles', () => {
  it('shows the unavailable note when there is no live data', () => {
    render(<ProcessDetailSlideout {...baseProps({ live: undefined })} />);
    expect(screen.getByText('monitoring.processDetail.live.unavailable')).toBeInTheDocument();
  });

  it('renders a tile per known live metric, omitting gpu/vram when absent', () => {
    render(<ProcessDetailSlideout {...baseProps({ live: { cpuPercent: 12, memoryMb: 512 } })} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('512 MB')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.processDetail.live.gpu')).toBeNull();
    expect(screen.queryByText('monitoring.processDetail.live.vram')).toBeNull();
  });

  it('renders gpu and vram tiles when present', () => {
    render(<ProcessDetailSlideout {...baseProps({ live: { cpuPercent: 1, memoryMb: 2, gpuPercent: 34, vramMb: 900 } })} />);
    expect(screen.getByText('monitoring.processDetail.live.gpu')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('900 MB')).toBeInTheDocument();
  });
});

describe('ProcessDetailSlideout usage chart', () => {
  it('shows an unsupported note when the apps-window route is unsupported', () => {
    render(<ProcessDetailSlideout {...baseProps({ appsWindow: { apps: [], loading: false, supported: false, mocked: false, ready: true } })} />);
    expect(screen.getByText('monitoring.processDetail.chart.unsupported')).toBeInTheDocument();
  });

  it('shows a no-data note when supported but this app has no series in the window', () => {
    render(<ProcessDetailSlideout {...baseProps({ appsWindow: { apps: [], loading: false, supported: true, mocked: false, ready: true } })} />);
    expect(screen.getByText('monitoring.processDetail.chart.noData')).toBeInTheDocument();
  });

  it('renders the mini chart and avg/max when this app has window data', () => {
    const appsWindow = {
      apps: [{ name: 'chrome.exe', avg: 20, max: 40, points: [{ t: 0, avg: 10 }, { t: 1000, avg: 20 }, { t: 2000, avg: 30 }] }],
      loading: false, supported: true, mocked: false, ready: true,
    };
    render(<ProcessDetailSlideout {...baseProps({ appsWindow, valueFormat: v => `${v}%` })} />);
    expect(screen.queryByText('monitoring.processDetail.chart.noData')).toBeNull();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });
});

describe('ProcessDetailSlideout info section', () => {
  it('shows an unsupported note when the route predates process-info', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, supported: false }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.unsupported')).toBeInTheDocument();
  });

  it('shows an error note on a real fetch failure', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, error: true, data: null }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.error')).toBeInTheDocument();
  });

  it('renders version/description/path/sha256/dates once loaded', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.getByText('124.0.1')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('shows an Unsigned badge only when the binary is unsigned', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData({ signed: false }) }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.getByText('monitoring.processDetail.info.unsigned')).toBeInTheDocument();
  });

  it('shows no Unsigned badge for a signed binary', () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData({ signed: true }) }));
    render(<ProcessDetailSlideout {...baseProps()} />);
    expect(screen.queryByText('monitoring.processDetail.info.unsigned')).toBeNull();
  });

  it('copies the path to the clipboard when the copy button is pressed', async () => {
    infoMock.mockReturnValue(infoResult({ loading: false, data: fullData() }));
    render(<ProcessDetailSlideout {...baseProps()} />);

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
    render(<ProcessDetailSlideout {...baseProps()} />);

    expect(screen.getByRole('button', { name: 'monitoring.processDetail.copy monitoring.processDetail.info.path' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'monitoring.processDetail.copy monitoring.processDetail.info.sha256' })).toBeInTheDocument();
  });
});

describe('ProcessDetailSlideout privacy section', () => {
  it('hides the section entirely when there are no matching sessions', () => {
    render(<ProcessDetailSlideout {...baseProps({ privacySessions: [] })} />);
    expect(screen.queryByText('monitoring.processDetail.privacy.title')).toBeNull();
  });

  it('hides the section when privacy is unsupported, even with sessions passed in', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: Date.now() - 1000, end: null }];
    render(<ProcessDetailSlideout {...baseProps({ privacySessions: sessions, privacySupported: false })} />);
    expect(screen.queryByText('monitoring.processDetail.privacy.title')).toBeNull();
  });

  it('renders this process\'s own sessions with capability and time', () => {
    const sessions: PrivacySession[] = [
      { app: 'C:\\chrome.exe', capability: 'webcam', start: Date.now() - 1000, end: null },
      { app: 'C:\\other.exe', capability: 'microphone', start: Date.now() - 2000, end: Date.now() - 500 },
    ];
    render(<ProcessDetailSlideout {...baseProps({ privacySessions: sessions })} />);
    expect(screen.getByText('monitoring.processDetail.privacy.title')).toBeInTheDocument();
    expect(screen.getByText('monitoring.privacy.capability.webcam')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.privacy.capability.microphone')).toBeNull();
  });
});
