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
  classification: 'Controllable', calibrated: true, ...over,
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
    dismissOnboardingHint: vi.fn(async () => ({ status: 200, body: { completed: true, dismissedHints: ['cooling-unresponsive'] } })),
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

const dead = () => fan({ id: 'fan-dead', name: 'Dead Fan', rpm: 0, classification: 'Unresponsive' });

describe('CoolingPage unresponsive hint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOnboardingHintSession();
    localStorage.clear();
    fans = [fan(), dead()];
    dismissedHints = [];
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced' } }));
  });

  it('shows on load when a fan is already Unresponsive, aimed at the eye', async () => {
    renderPage();
    await settle();
    await waitFor(() => expect(bubble()).not.toBeNull());
    expect(bubble()?.getAttribute('data-hint-id')).toBe('cooling-unresponsive');
    const selector = bubble()?.getAttribute('data-target') ?? '';
    expect(document.querySelector(selector)).toBe(screen.getByLabelText('devices.hidden.hide'));
  });

  it('stays hidden with no Unresponsive fan', async () => {
    fans = [fan()];
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden when the fan reports live RPM despite the label', async () => {
    fans = [fan(), { ...dead(), rpm: 800 }];
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden once the service lists the hint as dismissed', async () => {
    dismissedHints = ['cooling-unresponsive'];
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden when the eye is already hiding them', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { coolingDashboardMode: 'advanced', showUncontrolledCoolingDevices: false },
    }));
    renderPage();
    await settle();
    expect(bubble()).toBeNull();
  });

  it('stays hidden in simple mode', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'simple' } }));
    renderPage();
    await screen.findAllByRole('button');
    await waitFor(() => expect(bubble()).toBeNull());
  });

  it('dismisses through the service from the X', async () => {
    renderPage();
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByText('coachmark-x'));
    expect(dismissOnboardingHint).toHaveBeenCalledWith('cooling-unresponsive');
    expect(bubble()).toBeNull();
  });

  it('dismisses through the service when the eye is pressed', async () => {
    renderPage();
    await waitFor(() => expect(bubble()).not.toBeNull());
    fireEvent.click(screen.getByLabelText('devices.hidden.hide'));
    expect(dismissOnboardingHint).toHaveBeenCalledWith('cooling-unresponsive');
    expect(bubble()).toBeNull();
  });
});
