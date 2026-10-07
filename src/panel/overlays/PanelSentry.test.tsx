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
    vi.mocked(registerPhonePush).mockResolvedValue({});
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
});
