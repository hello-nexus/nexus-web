import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';
import { fetchTelemetryConsent, type TelemetryConsentResponse } from '../../../api/telemetry';
import { completeOnboarding } from '../../../api/onboarding';
import { getUpdateStatus } from '../../../api/update';

// postService is generic (<T>(path, body) => Promise<T | null>); forwarding
// through a plain vi.fn() sidesteps mockResolvedValue's generic-inference
// trouble, mirroring TransferToasts.test.tsx.
const postService = vi.fn();
vi.mock('../../../api/service', () => ({
  postService: (...args: unknown[]) => postService(...args),
}));

vi.mock('../../../api/telemetry', () => ({
  fetchTelemetryConsent: vi.fn(),
}));

vi.mock('../../../api/onboarding', () => ({
  completeOnboarding: vi.fn(),
}));

vi.mock('../../../api/autoStart', () => ({
  setAutoStart: vi.fn(),
}));

vi.mock('../../../api/update', () => ({
  getUpdateStatus: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const CONSENT_SWITCH_NAME = 'settings.telemetry.label';
const ENTER_BUTTON_NAME = 'welcome.enter';

// Platform 'linux' skips the startWithOs toggle entirely (its section only
// renders for 'windows'/'macos'), so the telemetry switch stays the only
// switch role on screen and the enter flow never touches setAutoStart.
function renderWelcome(onComplete = vi.fn()) {
  return render(<WelcomeScreen open platform="linux" onComplete={onComplete} />);
}

function pendingConsent() {
  let resolve!: (v: TelemetryConsentResponse | null) => void;
  const promise = new Promise<TelemetryConsentResponse | null>(r => { resolve = r; });
  vi.mocked(fetchTelemetryConsent).mockReturnValue(promise);
  return (v: TelemetryConsentResponse | null) => resolve(v);
}

beforeEach(() => {
  vi.clearAllMocks();
  postService.mockResolvedValue(null);
  vi.mocked(getUpdateStatus).mockResolvedValue(null);
});

describe('WelcomeScreen - telemetry consent seeding', () => {
  it('hides the toggle until the consent fetch resolves, then shows it checked ON for a fresh default-on install', async () => {
    const resolveConsent = pendingConsent();
    renderWelcome();

    expect(screen.queryByRole('switch', { name: CONSENT_SWITCH_NAME })).not.toBeInTheDocument();

    resolveConsent({ enabled: true });
    const toggle = await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('seeds the toggle OFF when the service reports a declined upgrade', async () => {
    vi.mocked(fetchTelemetryConsent).mockResolvedValue({ enabled: false });
    renderWelcome();

    const toggle = await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('falls back to OFF and still renders the rest of the screen when the consent fetch fails', async () => {
    vi.mocked(fetchTelemetryConsent).mockResolvedValue(null);
    renderWelcome();

    const toggle = await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: ENTER_BUTTON_NAME })).toBeEnabled();
  });
});

describe('WelcomeScreen - HeartBurst', () => {
  it('never fires the burst animation from the initial consent seed, even seeding straight to ON', async () => {
    vi.mocked(fetchTelemetryConsent).mockResolvedValue({ enabled: true });
    renderWelcome();

    const toggle = await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // useHeartBurstTrigger's own rising-edge effect (and HeartBurst's effect
    // reacting to it) fires a render cycle after the toggle mounts, so flush
    // that chain before asserting absence - or a real regression here would
    // still read as a false green.
    await act(async () => {});
    // HeartBurst only portals its .overlay div once a burst is queued; its
    // absence proves the null-to-true seed was never treated as a rising edge.
    expect(document.body.querySelector('[class*="overlay"]')).not.toBeInTheDocument();
  });
});

describe('WelcomeScreen - enter flow', () => {
  it('posts the toggled consent value and calls onComplete once completeOnboarding reports completed:true', async () => {
    vi.mocked(fetchTelemetryConsent).mockResolvedValue({ enabled: false });
    vi.mocked(completeOnboarding).mockResolvedValue({ completed: true });
    const onComplete = vi.fn();
    renderWelcome(onComplete);

    const toggle = await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: ENTER_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(postService).toHaveBeenCalledWith('/telemetry/consent', { enabled: true });
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it('shows the error message and never calls onComplete when completeOnboarding does not report completed:true', async () => {
    vi.mocked(fetchTelemetryConsent).mockResolvedValue({ enabled: false });
    vi.mocked(completeOnboarding).mockResolvedValue(null);
    const onComplete = vi.fn();
    renderWelcome(onComplete);

    await screen.findByRole('switch', { name: CONSENT_SWITCH_NAME });
    fireEvent.click(screen.getByRole('button', { name: ENTER_BUTTON_NAME }));

    expect(await screen.findByText('welcome.error')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
