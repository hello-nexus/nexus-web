import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelSwitchModal } from './ChannelSwitchModal';
import { authFetchWithStatus, fetchService, pingService, postService } from '../../../api/service';
import { savePreferences } from '../../../api/profiles';
import type { ChannelTarget } from '../../../api/update';

// Mocked at the transport layer, so api/update.ts runs for real, including how
// it reads a refusal's status and body.
vi.mock('../../../api/service', () => ({
  authFetchWithStatus: vi.fn(),
  fetchService: vi.fn(),
  postService: vi.fn(),
  pingService: vi.fn(),
}));

vi.mock('../../../api/profiles', () => ({
  savePreferences: vi.fn(),
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

let targetReply: () => ChannelTarget | null;
let progressReply: () => unknown;
let switchReply: () => { response: Response | null; status: number };

const refusal409 = () => ({
  response: new Response(JSON.stringify({ error: true, started: false, msg: 'An install is already in progress.' }), { status: 409 }),
  status: 409,
});
const unreachable = () => ({ response: null, status: 0 });
const startedReply = () => ({ response: new Response(JSON.stringify({ started: true }), { status: 200 }), status: 200 });
const switchCalls = () => vi.mocked(authFetchWithStatus).mock.calls.length;
const targetCalls = () => vi.mocked(fetchService).mock.calls.filter(c => String(c[0]).startsWith('/update/channel-target')).length;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  targetReply = () => target();
  progressReply = () => idle;
  switchReply = startedReply;
  vi.mocked(fetchService).mockImplementation((async (path: string) => {
    if (path.startsWith('/update/channel-target')) return targetReply();
    if (path === '/update/progress') return progressReply();
    return null;
  }) as never);
  vi.mocked(postService).mockResolvedValue(null);
  vi.mocked(pingService).mockResolvedValue(null as never);
  vi.mocked(authFetchWithStatus).mockImplementation((async () => switchReply()) as never);
  vi.mocked(savePreferences).mockResolvedValue({ success: true } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChannelSwitchModal preview', () => {
  it('shows the version, the production warning, and Cancel leaves everything alone', async () => {
    const onClose = vi.fn();
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    expect(screen.getByRole('img', { name: 'common.loading' })).toBeInTheDocument();
    await flush();

    expect(screen.getByText('update.switch.body:{"version":"3.1.0"}')).toBeInTheDocument();
    expect(screen.getByText('update.switch.noteProduction')).toBeInTheDocument();
    expect(vi.mocked(fetchService)).toHaveBeenCalledWith('/update/channel-target?channel=production');

    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(switchCalls()).toBe(0);
  });

  it('shows the beta note when switching to beta', async () => {
    targetReply = () => target({ channel: 'beta', version: '3.2.0-beta.1', direction: 'upgrade' });
    render(<ChannelSwitchModal open channel="beta" onClose={vi.fn()} />);
    await flush();

    expect(screen.getByText('update.switch.noteBeta')).toBeInTheDocument();
    expect(screen.queryByText('update.switch.noteProduction')).not.toBeInTheDocument();
  });

  it('says there is no release and offers only Close', async () => {
    targetReply = () => target({ direction: 'none', version: '' });
    render(<ChannelSwitchModal open channel="beta" onClose={vi.fn()} />);
    await flush();

    expect(screen.getByText(/update\.switch\.noRelease/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /update\.switch\.install/ })).not.toBeInTheDocument();
  });

  it('sends a manual-install platform to the download and never calls the switch', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    targetReply = () => target({ canAutoInstall: false, downloadUrl: 'https://example.com/Nexus.dmg' });
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'update.modal.download' }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/Nexus.dmg', '_blank', 'noopener,noreferrer');
    expect(switchCalls()).toBe(0);
    openSpy.mockRestore();
  });

  it('retries a failed lookup', async () => {
    targetReply = () => null;
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await flush();
    expect(screen.getByText(/update\.switch\.loadFailed/)).toBeInTheDocument();

    targetReply = () => target();
    fireEvent.click(screen.getByRole('button', { name: 'update.switch.tryAgain' }));
    await flush();
    expect(screen.getByRole('button', { name: /update\.switch\.install/ })).toBeInTheDocument();
  });

  it('on the channel latest already, writes only the preference and closes without installing', async () => {
    const onClose = vi.fn();
    targetReply = () => target({ channel: 'beta', version: '3.1.1-beta.1', currentVersion: '3.1.1-beta.1', direction: 'none' });
    render(<ChannelSwitchModal open channel="beta" onClose={onClose} />);
    await flush();

    expect(screen.getByText(/update\.switch\.alreadyOn/)).toBeInTheDocument();
    expect(screen.queryByText(/update\.switch\.noRelease/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /update\.switch\.useChannel/ }));
    await flush();

    expect(savePreferences).toHaveBeenCalledWith({ update: { updateChannel: 'beta' } });
    expect(switchCalls()).toBe(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open with an error when the preference cannot be saved', async () => {
    const onClose = vi.fn();
    vi.mocked(savePreferences).mockResolvedValue(null);
    targetReply = () => target({ version: '3.1.1-beta.1', currentVersion: '3.1.1-beta.1' });
    render(<ChannelSwitchModal open channel="beta" onClose={onClose} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /update\.switch\.useChannel/ }));
    await flush();

    expect(screen.getByText('update.switch.saveFailed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ChannelSwitchModal after Continue', () => {
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 250) await flush(250);
  };
  const cont = async () => {
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /update\.switch\.install/ }));
  };

  it('posts the previewed version and cannot be dismissed by X, Esc or backdrop', async () => {
    const onClose = vi.fn();
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    await cont();
    await flush();

    expect(vi.mocked(authFetchWithStatus)).toHaveBeenCalledWith('/update/switch-channel', {
      method: 'POST', body: { channel: 'production', version: '3.1.0' },
    });
    expect(screen.queryByRole('button', { name: CLOSE_X })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reloads onto the new build once the service answers on the target version, which may be older', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      progressReply = () => ({ ...idle, active: true, phase: 'installing', version: '3.1.0' });
      render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
      await cont();
      await advance(3_000);
      expect(screen.getAllByText('update.modal.reconnecting')).not.toHaveLength(0);

      vi.mocked(pingService).mockResolvedValue({ version: '3.1.0' } as never);
      await advance(3_500);
      expect(reload).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('treats a 409 as terminal: shows the reason, never retries, and Try again returns to the preview', async () => {
    const onClose = vi.fn();
    switchReply = refusal409;
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    await cont();
    await advance(1_000);

    expect(screen.getByText('update.switch.refused')).toBeInTheDocument();
    expect(screen.getByText('An install is already in progress.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CLOSE_X })).toBeInTheDocument();
    await advance(60_000);
    expect(switchCalls()).toBe(1);

    targetReply = () => target({ version: '3.1.2' });
    fireEvent.click(screen.getByRole('button', { name: 'update.switch.tryAgain' }));
    await flush();
    expect(targetCalls()).toBe(2);
    expect(screen.getByText('update.switch.body:{"version":"3.1.2"}')).toBeInTheDocument();
    expect(switchCalls()).toBe(1);
  });

  it('retries a transport failure on the bounded back-off, then exits with Try again and Close', async () => {
    const onClose = vi.fn();
    switchReply = unreachable;
    render(<ChannelSwitchModal open channel="production" onClose={onClose} />);
    await cont();
    await advance(1_000);

    expect(screen.queryByRole('button', { name: CLOSE_X })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await advance(120_000);
    expect(screen.getByText('update.modal.startFailed')).toBeInTheDocument();
    expect(switchCalls()).toBe(6);
    expect(screen.getByRole('button', { name: CLOSE_X })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'update.switch.tryAgain' }));
    await flush();
    expect(switchCalls()).toBe(7);

    await advance(120_000);
    fireEvent.click(screen.getAllByRole('button', { name: 'update.modal.close' })[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not follow an install it did not start', async () => {
    switchReply = unreachable;
    progressReply = () => ({ ...idle, active: true, phase: 'downloading', version: '9.9.9' });
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await cont();
    await advance(1_000);

    expect(screen.getByText('update.switch.otherInstall')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CLOSE_X })).toBeInTheDocument();
  });

  it('does not adopt another install launching while the switch runs', async () => {
    progressReply = () => ({ ...idle, active: true, phase: 'launching', version: '9.9.9' });
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await cont();
    await advance(3_000);

    expect(screen.getByText('update.switch.otherInstall')).toBeInTheDocument();
    expect(screen.queryByText('update.modal.reconnecting')).not.toBeInTheDocument();
  });

  it('ends in a closable failure with no Try again when the service never comes back', async () => {
    progressReply = () => ({ ...idle, active: true, phase: 'installing', version: '3.1.0' });
    render(<ChannelSwitchModal open channel="production" onClose={vi.fn()} />);
    await cont();
    await advance(3_000);
    expect(screen.queryByRole('button', { name: CLOSE_X })).not.toBeInTheDocument();

    await advance(125_000);
    expect(screen.getByText('update.modal.reconnectGaveUp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CLOSE_X })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'update.switch.tryAgain' })).not.toBeInTheDocument();
  });
});
