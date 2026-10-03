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

// A stable t, as the app's is: the progress poll effect depends on it.
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
  const idleProgress = {
    active: false, phase: 'idle' as const, percent: 0, message: '', version: '', success: false, error: '',
  };
  const readyStatus = { ...baseStatus, updateMode: 'download', updateReady: true };

  beforeEach(() => {
    vi.mocked(getUpdateProgress).mockResolvedValue(idleProgress);
    vi.mocked(pingService).mockResolvedValue(null as never);
  });

  it('starts the install and shows the error when the service rejects the start', async () => {
    vi.mocked(startUpdate).mockResolvedValue(null);
    render(<UpdateModal open autoCheck={false} startedInstall onClose={vi.fn()} status={readyStatus} />);

    await waitFor(() => expect(startUpdate).toHaveBeenCalledWith('3.1.0', { reopenAfter: true }));
    expect(await screen.findByText('update.modal.startFailed')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.starting')).not.toBeInTheDocument();
  });

  it('starts the install even while the service still reports the previous update', async () => {
    render(
      <UpdateModal open autoCheck={false} startedInstall onClose={vi.fn()} status={{ ...readyStatus, justUpdatedTo: '3.0.0' }} />,
    );

    await waitFor(() => expect(startUpdate).toHaveBeenCalledWith('3.1.0', { reopenAfter: true }));
  });

  it('shows the error when an accepted start never goes active', async () => {
    vi.useFakeTimers();
    try {
      render(<UpdateModal open autoCheck={false} startedInstall onClose={vi.fn()} status={readyStatus} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(screen.getByText('update.modal.startFailed')).toBeInTheDocument();
      expect(screen.queryByText('update.modal.starting')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
