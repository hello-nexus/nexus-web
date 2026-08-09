import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../api/update';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../api/update', async () => {
  const actual = await vi.importActual<typeof import('../api/update')>('../api/update');
  return { ...actual, getUpdateStatus: vi.fn() };
});

import { UpdateStatusSlot } from './sidebar';
import { getUpdateStatus } from '../api/update';

const baseStatus: UpdateStatus = {
  currentVersion: '3.0.0',
  latestVersion: '3.1.0',
  updateAvailable: false,
  updateReady: false,
  canAutoInstall: true,
  downloadUrl: '',
  channel: 'production',
  updateMode: '' as UpdateStatus['updateMode'],
  releaseNotes: '',
  lastCheckedUnix: 0,
  lastCheckError: '',
  state: 'idle',
  justUpdatedTo: '',
  publishedAtUnix: 0,
};

function renderSlot() {
  const onOpen = vi.fn();
  const onInstall = vi.fn();
  const view = render(<UpdateStatusSlot serviceOnline onOpen={onOpen} onInstall={onInstall} />);
  return { ...view, onOpen, onInstall };
}

describe('UpdateStatusSlot', () => {
  beforeEach(() => {
    vi.mocked(getUpdateStatus).mockReset();
  });

  it('renders nothing while the fetch is pending', () => {
    vi.mocked(getUpdateStatus).mockReturnValue(new Promise(() => {}));
    renderSlot();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('canAutoInstall=false: shows the download badge on updateAvailable alone, regardless of updateMode', async () => {
    vi.mocked(getUpdateStatus).mockResolvedValue({
      ...baseStatus, updateAvailable: true, updateReady: false, canAutoInstall: false, updateMode: 'always', downloadUrl: 'https://example.com/Nexus.dmg',
    });
    renderSlot();
    expect(await screen.findByRole('button', { name: 'update.badge.labelDownload' })).toBeInTheDocument();
  });

  it('canAutoInstall=false: stays hidden when updateAvailable is false even though updateReady is true', async () => {
    vi.mocked(getUpdateStatus).mockResolvedValue({
      ...baseStatus, updateAvailable: false, updateReady: true, canAutoInstall: false,
    });
    renderSlot();
    await waitFor(() => expect(getUpdateStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('canAutoInstall=true: keeps the notify/ready split unchanged', async () => {
    vi.mocked(getUpdateStatus).mockResolvedValue({
      ...baseStatus, updateAvailable: true, updateReady: false, canAutoInstall: true, updateMode: 'notify',
    });
    renderSlot();
    expect(await screen.findByRole('button', { name: 'update.badge.label' })).toBeInTheDocument();
  });

  it('canAutoInstall=true: hides the badge when only updateAvailable is set but mode is not notify (unchanged legacy behavior)', async () => {
    vi.mocked(getUpdateStatus).mockResolvedValue({
      ...baseStatus, updateAvailable: true, updateReady: false, canAutoInstall: true, updateMode: 'download',
    });
    renderSlot();
    await waitFor(() => expect(getUpdateStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
