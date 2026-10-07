import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelSentry } from './PanelSentry';
import { armSentry, disarmSentry, fetchSentry, registerPhonePush, type SentryState } from '../../api/sentry';

vi.mock('../../lib/i18n', async (importActual) => {
  const text: Record<string, string> = {
    'sentry.push.title': 'Sentry',
    'sentry.push.body': 'Someone is using {pc}',
  };
  const t = (key: string, params?: Record<string, string | number>) => {
    let out = text[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
  return { ...(await importActual<typeof import('../../lib/i18n')>()), useTranslation: () => ({ t }) };
});

vi.mock('../../api/sentry', () => ({
  fetchSentry: vi.fn(),
  armSentry: vi.fn(),
  disarmSentry: vi.fn(),
  registerPhonePush: vi.fn(),
}));

const state = (patch: Partial<SentryState>): SentryState => ({
  supported: true, armed: false, locked: true, alertPhones: 1, lastAlertAt: null, cooldownSeconds: 3600, ...patch,
});

type NativeWindow = {
  nexusNative?: { pushStatus: () => void; requestPushPermission: () => void };
  nexusNativePush?: unknown;
};

function installBridge(status: unknown) {
  const requestPushPermission = vi.fn();
  const w = window as unknown as NativeWindow;
  w.nexusNative = { pushStatus: vi.fn(), requestPushPermission };
  w.nexusNativePush = status;
  return requestPushPermission;
}

const props = { enabled: true, resolvedThemeMode: 'dark' as const, themeStyle: {} };

describe('PanelSentry', () => {
  beforeEach(() => {
    vi.mocked(registerPhonePush).mockResolvedValue(200);
    vi.mocked(fetchSentry).mockResolvedValue(state({}));
  });

  afterEach(() => {
    const w = window as unknown as NativeWindow;
    delete w.nexusNative;
    delete w.nexusNativePush;
    vi.clearAllMocks();
  });

  it('shows no card while the PC is unlocked', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    render(<PanelSentry {...props} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    expect(screen.queryByText('sentry.card.title')).toBeNull();
  });

  it('arms without locking and swaps to Disarm', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.disarm');
    expect(armSentry).toHaveBeenCalledWith(false);
  });

  it('disarms while armed', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ armed: true }));
    vi.mocked(disarmSentry).mockResolvedValue(state({ armed: false }));
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.disarm'));
    await screen.findByText('sentry.card.arm');
    expect(disarmSentry).toHaveBeenCalled();
  });

  it('reports a not_locked refusal', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'not_locked' });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.notLocked');
  });

  it('offers no alert controls in a plain browser', async () => {
    render(<PanelSentry {...props} />);
    await screen.findByText('sentry.card.arm');
    expect(screen.queryByText('sentry.card.enableAlerts')).toBeNull();
  });

  it('asks for permission from the card when the wrapper has not granted it', async () => {
    const request = installBridge({ platform: 'android', permission: 'prompt', token: null, environment: 'production' });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.enableAlerts'));
    expect(request).toHaveBeenCalled();
    expect(registerPhonePush).not.toHaveBeenCalled();
  });

  it('registers the push target once permission is granted, even while the PC is unlocked', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    installBridge({ platform: 'ios', permission: 'granted', token: 'ab12', environment: 'sandbox' });
    render(<PanelSentry {...props} />);
    await waitFor(() => expect(registerPhonePush).toHaveBeenCalledWith({
      platform: 'ios', token: 'ab12', environment: 'sandbox', title: 'Sentry', body: 'Someone is using {pc}',
    }));
  });

  it('re-registers when the wrapper reports a new token', async () => {
    installBridge({ platform: 'ios', permission: 'granted', token: 'one', environment: 'production' });
    render(<PanelSentry {...props} />);
    await waitFor(() => expect(registerPhonePush).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new CustomEvent('nexus:push-status', {
        detail: { platform: 'ios', permission: 'granted', token: 'two', environment: 'production' },
      }));
    });
    await waitFor(() => expect(registerPhonePush).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'two' })));
  });

  it('retries the registration on the next poll until a PUT succeeds, then claims alerts on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(registerPhonePush).mockResolvedValueOnce(0).mockResolvedValueOnce(503).mockResolvedValue(200);
      installBridge({ platform: 'ios', permission: 'granted', token: 'ab12', environment: 'production' });
      render(<PanelSentry {...props} />);
      await screen.findByText('sentry.card.arm');
      expect(registerPhonePush).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('sentry.card.alertsOn')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      expect(registerPhonePush).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('sentry.card.alertsOn')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await screen.findByText('sentry.card.alertsOn');
      expect(registerPhonePush).toHaveBeenCalledTimes(3);
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      expect(registerPhonePush).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops retrying after a 4xx until the registration changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(registerPhonePush).mockResolvedValue(400);
      installBridge({ platform: 'ios', permission: 'granted', token: 'one', environment: 'production' });
      render(<PanelSentry {...props} />);
      await screen.findByText('sentry.card.arm');
      await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
      expect(registerPhonePush).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('sentry.card.alertsOn')).toBeNull();
      vi.mocked(registerPhonePush).mockResolvedValue(200);
      act(() => {
        window.dispatchEvent(new CustomEvent('nexus:push-status', {
          detail: { platform: 'ios', permission: 'granted', token: 'two', environment: 'production' },
        }));
      });
      await screen.findByText('sentry.card.alertsOn');
      expect(registerPhonePush).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips polling while the document is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      render(<PanelSentry {...props} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
      expect(fetchSentry).not.toHaveBeenCalled();
    } finally {
      hidden.mockRestore();
      vi.useRealTimers();
    }
  });

  it('drops a stale not_locked error once the card hides', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'not_locked' });
      vi.mocked(fetchSentry).mockResolvedValueOnce(state({})).mockResolvedValueOnce(state({}))
        .mockResolvedValueOnce(state({ locked: false }))
        .mockResolvedValue(state({}));
      render(<PanelSentry {...props} />);
      fireEvent.click(await screen.findByText('sentry.card.arm'));
      await screen.findByText('sentry.card.notLocked');
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await screen.findByText('sentry.card.arm');
      expect(screen.queryByText('sentry.card.notLocked')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
