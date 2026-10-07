import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelSentry } from './PanelSentry';
import { armSentry, disarmSentry, fetchSentry, registerPhonePush, type SentryState } from '../../api/sentry';

vi.mock('../../lib/i18n', async (importActual) => {
  const text: Record<string, string> = {
    'sentry.push.title': 'Sentry Alert',
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

function stubReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const props = { enabled: true, resolvedThemeMode: 'dark' as const, themeStyle: {} };

describe('PanelSentry', () => {
  beforeEach(() => {
    stubReducedMotion(true);
    vi.mocked(registerPhonePush).mockResolvedValue(200);
    vi.mocked(fetchSentry).mockResolvedValue(state({}));
  });

  afterEach(() => {
    const w = window as unknown as NativeWindow;
    delete w.nexusNative;
    delete w.nexusNativePush;
    delete (window as { matchMedia?: unknown }).matchMedia;
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

  it('shows the failure line on a not_locked refusal and refreshes the card', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'not_locked' });
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    const arm = await screen.findByText('sentry.card.arm');
    rerender(<PanelSentry {...props} openRequest={1} />);
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    fireEvent.click(arm);
    await screen.findByText('sentry.card.failed');
    await screen.findByText('sentry.card.lockAndArm');
  });

  it('unlocked: Lock and Arm sends lock:true, shows Locking while waiting, then armed', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    let resolve: (v: Awaited<ReturnType<typeof armSentry>>) => void = () => {};
    vi.mocked(armSentry).mockReturnValue(new Promise((r) => { resolve = r; }));
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    rerender(<PanelSentry {...props} openRequest={1} />);
    await screen.findByText('sentry.card.promptLock');
    fireEvent.click(screen.getByText('sentry.card.lockAndArm'));
    expect(armSentry).toHaveBeenCalledWith(true);
    expect(screen.getByText('sentry.card.locking').closest('button')).toBeDisabled();
    expect(screen.getByText('sentry.card.lockingPc')).toBeTruthy();
    await act(async () => { resolve({ ok: true, state: state({ armed: true }) }); });
    await screen.findByText('sentry.card.disarm');
    expect(screen.getByText('sentry.card.armedTitle')).toBeTruthy();
  });

  it('unlocked: a lock failure returns to idle with the failure line', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'failed' });
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    rerender(<PanelSentry {...props} openRequest={1} />);
    fireEvent.click(await screen.findByText('sentry.card.lockAndArm'));
    await screen.findByText('sentry.card.failed');
    expect(screen.getByText('sentry.card.lockAndArm').closest('button')).toBeEnabled();
    expect(screen.queryByText('sentry.card.disarm')).toBeNull();
  });

  it('plays the arming animation for the minimum duration before showing armed', async () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
      render(<PanelSentry {...props} />);
      fireEvent.click(await screen.findByText('sentry.card.arm'));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(armSentry).toHaveBeenCalledWith(false);
      expect(screen.getByText('sentry.card.arming', { selector: 'button *' }).closest('button')).toBeDisabled();
      expect(screen.queryByText('sentry.card.disarm')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      await screen.findByText('sentry.card.disarm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reduced motion skips the minimum duration', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.disarm');
  });

  it('tapping the icon while idle arms like the button', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    await screen.findByText('sentry.card.arm');
    fireEvent.click(screen.getAllByRole('button', { name: 'sentry.card.arm' })[0]);
    await screen.findByText('sentry.card.disarm');
    expect(armSentry).toHaveBeenCalledWith(false);
  });

  it('a desktop_only refusal falls back to the lock-first hint with a disabled Arm for the session', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'desktop_only' });
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    rerender(<PanelSentry {...props} openRequest={1} />);
    fireEvent.click(await screen.findByText('sentry.card.lockAndArm'));
    await screen.findByText('sentry.card.notLocked');
    expect(screen.queryByText('sentry.card.failed')).toBeNull();
    expect(screen.getByText('sentry.card.arm').closest('button')).toBeDisabled();
    expect(armSentry).toHaveBeenCalledTimes(1);
  });

  it('shows the alerts setup line while permission is at prompt', async () => {
    installBridge({ platform: 'ios', permission: 'prompt', token: null, environment: 'production' });
    render(<PanelSentry {...props} />);
    await screen.findByText('sentry.card.alertsSetup');
  });

  it('shows no separate alerts button', async () => {
    render(<PanelSentry {...props} />);
    await screen.findByText('sentry.card.arm');
    expect(screen.queryByText('sentry.card.enableAlerts')).toBeNull();
  });

  it('requests permission when arming while the wrapper is at prompt, and still arms', async () => {
    const request = installBridge({ platform: 'android', permission: 'prompt', token: null, environment: 'production' });
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.disarm');
    expect(request).toHaveBeenCalledTimes(1);
    expect(armSentry).toHaveBeenCalledWith(false);
  });

  it.each(['granted', 'denied'])('does not request permission when %s', async (permission) => {
    const request = installBridge({ platform: 'ios', permission, token: null, environment: 'production' });
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.disarm');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not request permission in a plain browser', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<PanelSentry {...props} />);
    fireEvent.click(await screen.findByText('sentry.card.arm'));
    await screen.findByText('sentry.card.disarm');
    expect(registerPhonePush).not.toHaveBeenCalled();
  });

  it('dismisses with the X until the next lock transition', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchSentry).mockResolvedValue(state({}));
      render(<PanelSentry {...props} />);
      fireEvent.click(await screen.findByLabelText('app.window.close'));
      expect(screen.queryByText('sentry.card.title')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      expect(screen.queryByText('sentry.card.title')).toBeNull();
      vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      expect(screen.queryByText('sentry.card.title')).toBeNull();
      vi.mocked(fetchSentry).mockResolvedValue(state({ locked: true }));
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await screen.findByText('sentry.card.title');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports support and reopens a dismissed card from the menu request', async () => {
    const onSupportedChange = vi.fn();
    const { rerender } = render(<PanelSentry {...props} openRequest={0} onSupportedChange={onSupportedChange} />);
    fireEvent.click(await screen.findByLabelText('app.window.close'));
    expect(screen.queryByText('sentry.card.title')).toBeNull();
    expect(onSupportedChange).toHaveBeenLastCalledWith(true);
    rerender(<PanelSentry {...props} openRequest={1} onSupportedChange={onSupportedChange} />);
    await screen.findByText('sentry.card.title');
  });

  it('opened from the menu while unlocked: shows the lock hint and an enabled Lock and Arm', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    expect(screen.queryByText('sentry.card.title')).toBeNull();
    rerender(<PanelSentry {...props} openRequest={1} />);
    await screen.findByText('sentry.card.promptLock');
    expect(screen.getByText('sentry.card.lockAndArm').closest('button')).toBeEnabled();
  });

  it('opened from the menu while armed and unlocked: Disarm still works', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false, armed: true }));
    vi.mocked(disarmSentry).mockResolvedValue(state({ locked: false, armed: false }));
    const { rerender } = render(<PanelSentry {...props} openRequest={0} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    rerender(<PanelSentry {...props} openRequest={1} />);
    fireEvent.click(await screen.findByText('sentry.card.disarm'));
    await screen.findByText('sentry.card.lockAndArm');
    expect(disarmSentry).toHaveBeenCalled();
  });

  it('hides the row support flag when the service reports unsupported', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ supported: false }));
    const onSupportedChange = vi.fn();
    render(<PanelSentry {...props} onSupportedChange={onSupportedChange} />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    expect(onSupportedChange).toHaveBeenLastCalledWith(false);
  });

  it('registers the push target once permission is granted, even while the PC is unlocked', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ locked: false }));
    installBridge({ platform: 'ios', permission: 'granted', token: 'ab12', environment: 'sandbox' });
    render(<PanelSentry {...props} />);
    await waitFor(() => expect(registerPhonePush).toHaveBeenCalledWith({
      platform: 'ios', token: 'ab12', environment: 'sandbox', title: 'Sentry Alert', body: 'Someone is using {pc}',
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

  it('keeps retrying after a 403 (Remote off) until a PUT succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(registerPhonePush).mockResolvedValueOnce(403).mockResolvedValue(200);
      installBridge({ platform: 'ios', permission: 'granted', token: 'ab12', environment: 'production' });
      render(<PanelSentry {...props} />);
      await screen.findByText('sentry.card.arm');
      expect(registerPhonePush).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('sentry.card.alertsOn')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
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

  it('drops a stale failure line once the card hides', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'failed' });
      vi.mocked(fetchSentry).mockResolvedValueOnce(state({})).mockResolvedValueOnce(state({ locked: false }))
        .mockResolvedValue(state({}));
      render(<PanelSentry {...props} />);
      fireEvent.click(await screen.findByText('sentry.card.arm'));
      await screen.findByText('sentry.card.failed');
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      await screen.findByText('sentry.card.arm');
      expect(screen.queryByText('sentry.card.failed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
