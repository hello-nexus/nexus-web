import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { resetOnboardingHintSession } from '../../../hooks/useOnboardingHint';

// Rendered outside I18nProvider, so t() falls back to raw keys.

let fans: Array<Record<string, unknown>> = [];
let dismissedHints: string[] | null = [];

const fan = (over: Record<string, unknown> = {}) => ({
  id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Auto',
  classification: 'Controllable', calibrated: false, ...over,
});

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({ channels: fans })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    startCalibration: vi.fn(async () => ({ error: false })),
  };
});

vi.mock('../../../api/onboarding', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/onboarding')>();
  return {
    ...original,
    fetchOnboardingStatus: vi.fn(async () => (dismissedHints ? { completed: true, dismissedHints } : null)),
    dismissOnboardingHint: vi.fn(async () => ({ status: 200, body: { completed: true, dismissedHints: ['cooling-calibrate'] } })),
  };
});

// The real bubble needs layout; a stub exposes the props the page passes.
vi.mock('../../../components/common/Coachmark/Coachmark', () => ({
  Coachmark: (p: { hintId: string; target: string; onDismiss: () => void }) => (
    <div data-testid="coachmark" data-hint-id={p.hintId} data-target={p.target}>
      <button onClick={p.onDismiss}>coachmark-x</button>
    </div>
  ),
}));

import { dismissOnboardingHint } from '../../../api/onboarding';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

function renderPage(calibrating = false) {
  const serviceState = { cooling: { calibrating } } as unknown as ServiceState;
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

const bubble = () => screen.queryByTestId('coachmark');
const settle = () => screen.findByRole('button', { name: /cooling\.calibrate\.button/ });

describe('CoolingPage calibrate hint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOnboardingHintSession();
    localStorage.clear();
    fans = [fan()];
    dismissedHints = [];
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced' } }));
  });

  it('shows in advanced mode on an uncalibrated PC, aimed at the real calibrate button', async () => {
    renderPage();
    const btn = await settle();
    await waitFor(() => expect(bubble()).not.toBeNull());
    expect(bubble()?.getAttribute('data-hint-id')).toBe('cooling-calibrate');
    const selector = bubble()?.getAttribute('data-target') ?? '';
    expect(document.querySelector(selector)).toBe(btn);
  });

  it('stays hidden in simple mode', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'simple' } }));
    renderPage();
    await screen.findAllByRole('button');
    await waitFor(() => expect(bubble()).toBeNull());
  });

  it('stays hidden once the service lists the hint as dismissed', async () => {
    dismissedHints = ['cooling-calibrate'];
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden while the service has not answered', async () => {
    dismissedHints = null;
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden with no controllable fan', async () => {
    fans = [fan({ controlled: false }), fan({ id: 'b', readOnly: true }), fan({ id: 'c', classification: 'Fixed' })];
    renderPage();
    await screen.findAllByRole('button');
    expect(bubble()).toBeNull();
  });

  it('stays hidden while a calibration is running', async () => {
    renderPage(true);
    await screen.findAllByRole('button');
    expect(bubble()).toBeNull();
  });

  it('ignores a calibrated fan that is not controllable', async () => {
    fans = [fan(), fan({ id: 'b', controlled: false, calibrated: true })];
    renderPage();
    await waitFor(() => expect(bubble()).not.toBeNull());
    expect(dismissOnboardingHint).not.toHaveBeenCalled();
  });

  it('hides and marks the hint dismissed when a controllable fan is already calibrated', async () => {
    fans = [fan({ calibrated: true })];
    renderPage();
    await settle();
    await waitFor(() => expect(dismissOnboardingHint).toHaveBeenCalledWith('cooling-calibrate'));
    expect(bubble()).toBeNull();
  });

  it('does not re-send the dismissal for a hint the service already holds', async () => {
    dismissedHints = ['cooling-calibrate'];
    fans = [fan({ calibrated: true })];
    renderPage();
    await settle();
    expect(dismissOnboardingHint).not.toHaveBeenCalled();
  });

  it('dismisses through the service before the confirm popup opens', async () => {
    renderPage();
    const btn = await settle();
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(btn);
    expect(dismissOnboardingHint).toHaveBeenCalledWith('cooling-calibrate');
    expect(await screen.findByText('cooling.calibrate.confirmTitle')).toBeTruthy();
    expect(bubble()).toBeNull();
  });

  it('dismisses through the service from the X', async () => {
    renderPage();
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByText('coachmark-x'));
    expect(dismissOnboardingHint).toHaveBeenCalledWith('cooling-calibrate');
    expect(bubble()).toBeNull();
  });
});
