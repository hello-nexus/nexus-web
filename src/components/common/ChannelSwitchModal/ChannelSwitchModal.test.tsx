import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelSwitchModal } from './ChannelSwitchModal';
import { pingService } from '../../../api/service';
import { checkForUpdate, getChannelTarget, getUpdateProgress, getUpdateStatus, startUpdate, switchChannel, type ChannelTarget } from '../../../api/update';

vi.mock('../../../api/update', () => ({
  checkForUpdate: vi.fn(),
  getChannelTarget: vi.fn(),
  getUpdateProgress: vi.fn(),
  getUpdateStatus: vi.fn(),
  startUpdate: vi.fn(),
  switchChannel: vi.fn(),
}));

vi.mock('../../../api/service', () => ({
  pingService: vi.fn(),
}));

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t, language: 'en' }),
}));

const target = (over: Partial<ChannelTarget> = {}): ChannelTarget => ({
  channel: 'production',
  currentVersion: '3.1.1-beta.1',
  version: '3.1.0',
  direction: 'downgrade',
  canAutoInstall: true,
  downloadUrl: '',
  releaseNotes: '',
  error: '',
  ...over,
});

const idle = { active: false, phase: 'idle' as const, percent: 0, message: '', version: '', success: false, error: '' };
const CLOSE_X = 'app.window.close';
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(getChannelTarget).mockResolvedValue(target());
  vi.mocked(getUpdateProgress).mockResolvedValue(idle);
  vi.mocked(getUpdateStatus).mockResolvedValue(null);
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(pingService).mockResolvedValue(null as never);
  vi.mocked(switchChannel).mockResolvedValue({ started: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChannelSwitchModal preview', () => {
  it('shows the version, the production warning, and Cancel leaves everything alone', async () => {
    const onClose = vi.fn();
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await flush();

    expect(screen.getByText('update.switch.body:{"version":"3.1.0"}')).toBeInTheDocument();
    expect(screen.getByText('update.switch.noteProduction')).toBeInTheDocument();
    expect(getChannelTarget).toHaveBeenCalledWith('production');

    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(switchChannel).not.toHaveBeenCalled();
  });

  it('shows the beta note when switching to beta', async () => {
    vi.mocked(getChannelTarget).mockResolvedValue(target({ channel: 'beta', version: '3.2.0-beta.1', direction: 'upgrade' }));
    render(<ChannelSwitchModal open channel="beta" onClose={vi.fn()} />);
    await flush();

    expect(screen.getByText('update.switch.noteBeta')).toBeInTheDocument();
    expect(screen.queryByText('update.switch.noteProduction')).not.toBeInTheDocument();
  });

  it('says there is no release and offers only Close', async () => {
    vi.mocked(getChannelTarget).mockResolvedValue(target({ direction: 'none', version: '' }));
    render(<ChannelSwitchModal open channel="beta" onClose={vi.fn()} />);
    await flush();

    expect(screen.getByText(/update\.switch\.noRelease/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /update\.switch\.install/ })).not.toBeInTheDocument();
  });

  it('sends a manual-install platform to the download and never calls the switch', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.mocked(getChannelTarget).mockResolvedValue(target({ canAutoInstall: false, downloadUrl: 'https://example.com/Nexus.dmg' }));
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'update.modal.download' }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/Nexus.dmg', '_blank', 'noopener,noreferrer');
    expect(switchChannel).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('retries a failed lookup', async () => {
    vi.mocked(getChannelTarget).mockResolvedValueOnce(null).mockResolvedValue(target());
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await flush();
    expect(screen.getByText(/update\.switch\.loadFailed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'update.switch.tryAgain' }));
    await flush();
    expect(screen.getByRole('button', { name: /update\.switch\.install/ })).toBeInTheDocument();
  });
});

describe('ChannelSwitchModal after Continue', () => {
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 250) await flush(250);
  };

  it('starts the switch for the previewed version and cannot be dismissed', async () => {
    const onClose = vi.fn();
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /update\.switch\.install/ }));
    await flush();

    expect(switchChannel).toHaveBeenCalledWith('production', '3.1.0');
    expect(startUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: CLOSE_X })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reloads onto the new build once the service answers on the target version, which may be older', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      vi.mocked(getUpdateProgress).mockResolvedValue({ ...idle, active: true, phase: 'installing', version: '3.1.0' });
      render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
      await flush();
      fireEvent.click(screen.getByRole('button', { name: /update\.switch\.install/ }));
      await advance(3_000);
      expect(screen.getAllByText('update.modal.reconnecting')).not.toHaveLength(0);

      vi.mocked(pingService).mockResolvedValue({ version: '3.1.0' } as never);
      await advance(3_500);
      expect(reload).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('stays locked through the retry back-off, then exits with the error and Try again', async () => {
    const onClose = vi.fn();
    vi.mocked(switchChannel).mockResolvedValue({ started: false } as never);
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /update\.switch\.install/ }));
    await advance(1_000);

    expect(screen.queryByRole('button', { name: CLOSE_X })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(checkForUpdate).not.toHaveBeenCalled();

    await advance(120_000);
    expect(screen.getByText('update.modal.startFailed')).toBeInTheDocument();
    expect(switchChannel).toHaveBeenCalledTimes(6);
    expect(screen.getByRole('button', { name: CLOSE_X })).toBeInTheDocument();

    vi.mocked(switchChannel).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'update.switch.tryAgain' }));
    await flush();
    expect(switchChannel).toHaveBeenCalledTimes(1);

    await advance(120_000);
    fireEvent.click(screen.getAllByRole('button', { name: 'update.modal.close' })[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
