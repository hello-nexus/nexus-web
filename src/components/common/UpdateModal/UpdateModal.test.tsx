import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateModal } from './UpdateModal';
import { pingService } from '../../../api/service';
import { checkForUpdate, getUpdateProgress, getUpdateStatus, startUpdate, type UpdateStatus } from '../../../api/update';

vi.mock('../../../api/update', () => ({
  checkForUpdate: vi.fn(),
  getUpdateProgress: vi.fn(),
  getUpdateStatus: vi.fn(),
  startUpdate: vi.fn(),
}));

vi.mock('../../../api/service', () => ({
  pingService: vi.fn(),
}));

// A stable t, as the app's is.
const t = (key: string) => key;
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t, language: 'en' }),
}));

const baseStatus: UpdateStatus = {
  currentVersion: '3.0.0',
  latestVersion: '3.1.0',
  updateAvailable: true,
  updateReady: false,
  canAutoInstall: true,
  downloadUrl: '',
  channel: 'production',
  updateMode: 'notify',
  releaseNotes: '',
  lastCheckedUnix: 0,
  lastCheckError: '',
  state: 'idle',
  justUpdatedTo: '',
  publishedAtUnix: 0,
};

const DOWNLOAD_AND_INSTALL = 'update.modal.downloadAndInstall';
const DOWNLOAD_ONLY = 'update.modal.download';

beforeEach(() => {
  vi.mocked(getUpdateProgress).mockResolvedValue(null);
  vi.mocked(getUpdateStatus).mockResolvedValue(null);
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(startUpdate).mockResolvedValue({ started: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpdateModal - canAutoInstall=false (mac/linux)', () => {
  it('shows the download-only primary action instead of Download & install', () => {
    render(
      <UpdateModal
        open
        autoCheck={false}
        onClose={vi.fn()}
        status={{ ...baseStatus, canAutoInstall: false, downloadUrl: 'https://example.com/Nexus.dmg' }}
      />,
    );

    expect(screen.getByRole('button', { name: DOWNLOAD_ONLY })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOWNLOAD_AND_INSTALL })).not.toBeInTheDocument();
  });

  it('opens the release asset in a new tab and never calls startUpdate', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <UpdateModal
        open
        autoCheck={false}
        onClose={vi.fn()}
        status={{ ...baseStatus, canAutoInstall: false, downloadUrl: 'https://example.com/Nexus.dmg' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD_ONLY }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/Nexus.dmg', '_blank', 'noopener,noreferrer');
    expect(startUpdate).not.toHaveBeenCalled();
  });
});

describe('UpdateModal - canAutoInstall=true (Windows, unchanged)', () => {
  it('keeps the Download & install action and starts the OTA flow on click', async () => {
    render(
      <UpdateModal
        open
        autoCheck={false}
        onClose={vi.fn()}
        status={{ ...baseStatus, canAutoInstall: true }}
      />,
    );

    expect(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOWNLOAD_ONLY })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL }));
    await waitFor(() => expect(startUpdate).toHaveBeenCalledWith('3.1.0', { reopenAfter: true }));
  });

  it('reconnects when the service restarts on the target version between two progress polls', async () => {
    vi.mocked(getUpdateProgress).mockClear();
    vi.mocked(pingService).mockClear();
    vi.mocked(getUpdateProgress).mockResolvedValue({
      active: false, phase: 'idle', percent: 0, message: '', version: '', success: false, error: '',
    });
    vi.mocked(pingService).mockResolvedValue({ version: '3.1.0' } as never);
    render(
      <UpdateModal
        open
        autoCheck={false}
        onClose={vi.fn()}
        status={{ ...baseStatus, canAutoInstall: true }}
      />,
    );
    // Let the on-open poll see the idle service and stop, as it does in the app.
    await waitFor(() => expect(getUpdateProgress).toHaveBeenCalledTimes(1));
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL }));
    expect(await screen.findAllByText('update.modal.reconnecting')).not.toHaveLength(0);
  });
});

describe('UpdateModal - a check GitHub refused', () => {
  const refused = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
    ...baseStatus, latestVersion: '3.0.0', updateAvailable: false,
    lastCheckError: 'HttpRequestException: Response status code does not indicate success: 403 (rate limit exceeded).', ...over,
  });

  function Harness() {
    const [status, setStatus] = useState<UpdateStatus>(refused({ lastCheckError: '' }));
    return <UpdateModal open onClose={vi.fn()} status={status} onStatusRefreshed={setStatus} />;
  }

  it('says it could not check instead of claiming the system is up to date', async () => {
    vi.mocked(checkForUpdate).mockResolvedValue(refused());
    render(<Harness />);

    expect(await screen.findByText('update.modal.checkFailed')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.upToDate')).not.toBeInTheDocument();
  });

  it('still offers an update it already knows about', async () => {
    vi.mocked(checkForUpdate).mockResolvedValue(refused({ latestVersion: '3.1.0', updateAvailable: true }));
    render(<Harness />);

    expect(await screen.findByRole('button', { name: DOWNLOAD_AND_INSTALL })).toBeInTheDocument();
    expect(screen.queryByText('update.modal.checkFailed')).not.toBeInTheDocument();
  });
});

describe('UpdateModal - background staging', () => {
  it('stays on the notes view while an update stages in the background', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(pingService).mockResolvedValue(null as never);
      vi.mocked(getUpdateProgress)
        .mockResolvedValueOnce({ active: true, phase: 'downloading', percent: 40, message: '', version: '3.1.0', success: false, error: '' })
        .mockResolvedValue({ active: false, phase: 'idle', percent: 0, message: '', version: '3.1.0', success: false, error: '' });
      render(<UpdateModal open autoCheck={false} onClose={vi.fn()} status={{ ...baseStatus, updateMode: 'download' }} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });

      expect(screen.queryByText('update.modal.starting')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('UpdateModal - opened by the badge install (startedInstall)', () => {
  const frame = (phase: string, active: boolean) => ({
    active, phase: phase as never, percent: 0, message: '', version: '3.1.0', success: false, error: '',
  });
  const idle = frame('idle', false);
  const readyStatus: UpdateStatus = { ...baseStatus, updateMode: 'download', updateReady: true };
  const starts = () => vi.mocked(startUpdate).mock.calls.length;
  // Small steps let React render between timers, as it does in the browser.
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed <= ms; elapsed += 250) {
      await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, ms - elapsed)); });
    }
  };

  function Harness({ open = true }: { open?: boolean }) {
    const [status, setStatus] = useState<UpdateStatus>(readyStatus);
    return <UpdateModal open={open} autoCheck={false} startedInstall onClose={vi.fn()} status={status} onStatusRefreshed={setStatus} />;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(getUpdateProgress).mockResolvedValue(idle);
    vi.mocked(pingService).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the install even while the service still reports the previous update', async () => {
    render(
      <UpdateModal open autoCheck={false} startedInstall onClose={vi.fn()} status={{ ...readyStatus, justUpdatedTo: '3.0.0' }} />,
    );
    await advance(0);

    expect(startUpdate).toHaveBeenCalledWith('3.1.0', { reopenAfter: true });
  });

  it('retries a refused start and goes on once the service accepts', async () => {
    vi.mocked(startUpdate).mockResolvedValueOnce(null).mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 2 ? frame('downloading', true) : idle));
    render(<Harness />);
    await advance(5_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.downloading')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.startFailed')).not.toBeInTheDocument();
  });

  it('follows an install the service is already running instead of retrying', async () => {
    vi.mocked(startUpdate).mockResolvedValue(null);
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 1 ? frame('verifying', true) : idle));
    render(<Harness />);
    await advance(10_000);

    expect(starts()).toBe(1);
    expect(screen.getByText('update.modal.verifying')).toBeInTheDocument();
  });

  it('lands on up to date when the re-check finds nothing to install', async () => {
    vi.mocked(startUpdate).mockResolvedValue(null);
    vi.mocked(checkForUpdate).mockResolvedValue({ ...readyStatus, currentVersion: '3.1.0', updateAvailable: false, updateReady: false });
    render(<Harness />);
    await advance(10_000);

    expect(starts()).toBe(1);
    expect(screen.getByText('update.modal.upToDate')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.startFailed')).not.toBeInTheDocument();
  });

  it('retries when the install it started fails', async () => {
    vi.mocked(startUpdate).mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => {
      if (starts() === 1) return { ...frame('failed', false), error: 'IOException: locked' };
      return starts() >= 2 ? frame('downloading', true) : idle;
    });
    render(<Harness />);
    await advance(6_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.downloading')).toBeInTheDocument();
  });

  it('retries when the install it started goes idle without launching the installer', async () => {
    let firstStartAt = 0;
    vi.mocked(startUpdate).mockImplementation(async () => {
      if (starts() === 1) firstStartAt = Date.now();
      return { started: true };
    });
    vi.mocked(getUpdateProgress).mockImplementation(async () => {
      if (starts() === 1) return Date.now() - firstStartAt < 3_000 ? frame('downloading', true) : idle;
      return starts() >= 2 ? frame('verifying', true) : idle;
    });
    render(<Harness />);
    await advance(8_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.verifying')).toBeInTheDocument();
  });

  it('retries an accepted start that never goes active, then reports it', async () => {
    vi.mocked(startUpdate).mockResolvedValue({ started: true });
    render(<Harness />);
    await advance(200_000);

    expect(starts()).toBe(6);
    expect(screen.getByText('update.modal.startFailed')).toBeInTheDocument();
  });

  it('keeps retrying a refused start, then reports it with the install action still offered', async () => {
    vi.mocked(startUpdate).mockResolvedValue(null);
    render(<Harness />);
    await advance(80_000);

    expect(starts()).toBe(6);
    expect(screen.getByText('update.modal.startFailed')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.starting')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL })).toBeInTheDocument();
  });

  it('re-enables the install action when the modal reopens after closing mid-start', async () => {
    vi.mocked(startUpdate).mockReturnValue(new Promise(() => {}));
    const props = { autoCheck: false, onClose: vi.fn(), status: readyStatus };
    const { rerender } = render(<UpdateModal open startedInstall {...props} />);
    await advance(1_000);
    rerender(<UpdateModal open={false} startedInstall={false} {...props} />);
    rerender(<UpdateModal open startedInstall={false} {...props} />);
    await advance(0);

    expect(screen.getByRole('button', { name: DOWNLOAD_AND_INSTALL })).toBeEnabled();
  });

  it('recovers when an install it follows goes idle before the poll sees it', async () => {
    let refused = false;
    let readsAfterRefusal = 0;
    vi.mocked(startUpdate)
      .mockImplementationOnce(() => Promise.resolve(null).then(v => { refused = true; return v; }))
      .mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => {
      if (starts() >= 2) return frame('downloading', true);
      if (!refused) return idle;
      return ++readsAfterRefusal === 1 ? frame('verifying', true) : idle;
    });
    render(<Harness />);
    await advance(8_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.downloading')).toBeInTheDocument();
  });

  it('retries a start that never answers even while the service is unreachable', async () => {
    vi.mocked(startUpdate).mockReturnValueOnce(new Promise(() => {})).mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 2 ? frame('downloading', true) : null));
    render(<Harness />);
    await advance(16_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.downloading')).toBeInTheDocument();
  });

  it('ignores a late reply to an attempt the watchdog already replaced', async () => {
    let answerFirst: (v: { started: boolean }) => void = () => {};
    vi.mocked(startUpdate)
      .mockReturnValueOnce(new Promise(resolve => { answerFirst = resolve; }))
      .mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 2 ? frame('downloading', true) : idle));
    render(<Harness />);
    await advance(16_000);
    answerFirst({ started: false });
    await advance(10_000);

    expect(starts()).toBe(2);
    expect(screen.getByText('update.modal.downloading')).toBeInTheDocument();
  });

  it('keeps following an installer launch when the start it came from replies with a failure', async () => {
    let startedAt = 0;
    vi.mocked(startUpdate).mockImplementation(() => {
      startedAt = Date.now();
      return new Promise(resolve => { setTimeout(() => resolve(null), 3_000); });
    });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (startedAt && Date.now() - startedAt >= 1_000 ? frame('launching', true) : idle));
    render(<Harness />);
    await advance(20_000);

    expect(starts()).toBe(1);
    expect(screen.getAllByText('update.modal.reconnecting').length).toBeGreaterThan(0);
    expect(screen.queryByText('update.modal.startFailed')).not.toBeInTheDocument();
  });

  it('shows up to date rather than an old failure when the re-check finds nothing', async () => {
    vi.mocked(startUpdate).mockResolvedValue({ started: true });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 1 ? { ...frame('failed', false), error: 'IOException' } : idle));
    vi.mocked(checkForUpdate).mockResolvedValue({ ...readyStatus, currentVersion: '3.1.0', updateAvailable: false, updateReady: false });
    render(<Harness />);
    await advance(6_000);

    expect(screen.getByText('update.modal.upToDate')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.failedMessage')).not.toBeInTheDocument();
  });

  it('keeps retrying when the re-check is refused rather than landing on up to date', async () => {
    vi.mocked(startUpdate).mockResolvedValueOnce(null).mockResolvedValue({ started: true });
    vi.mocked(checkForUpdate).mockResolvedValue({
      ...readyStatus, latestVersion: '3.0.0', updateAvailable: false, updateReady: false, lastCheckError: 'HttpRequestException: 403',
    });
    vi.mocked(getUpdateProgress).mockImplementation(async () => (starts() >= 2 ? frame('downloading', true) : idle));
    render(<Harness />);
    await advance(5_000);

    expect(starts()).toBe(2);
    expect(vi.mocked(startUpdate).mock.calls[1][0]).toBe('3.1.0');
    expect(screen.queryByText('update.modal.upToDate')).not.toBeInTheDocument();
  });

  it('stops retrying once the modal closes', async () => {
    vi.mocked(startUpdate).mockResolvedValue(null);
    const { rerender } = render(<Harness />);
    await advance(1_000);
    rerender(<Harness open={false} />);
    await advance(80_000);

    expect(starts()).toBe(1);
  });
});
