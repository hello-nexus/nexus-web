import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [{ id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Auto', classification: 'Controllable', calibrated: false }],
    })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
  };
});

// The hint stays undismissed here, so a hidden bubble can only come from the gate under test.
vi.mock('../../../hooks/useOnboardingHint', () => ({
  useOnboardingHint: () => hint,
  resetOnboardingHintSession: () => {},
}));
const hint = { dismissed: false as boolean | null, dismiss: vi.fn() };

vi.mock('../../../components/common/Coachmark/Coachmark', () => ({
  Coachmark: () => <div data-testid="coachmark" />,
}));

vi.mock('../../../components/common/ImportCenter/ImportDialog', () => ({
  availableImportSources: () => [{ id: 'fancontrol' }],
  ImportDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="import-dialog" /> : null),
}));

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;
const bubble = () => screen.queryByTestId('coachmark');

async function renderAdvanced() {
  render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} platform="windows" />
    </UiSettingsProvider>,
  );
  await screen.findByRole('button', { name: /cooling\.calibrate\.button/ });
  await waitFor(() => expect(bubble()).not.toBeNull());
}

describe('CoolingPage calibrate hint gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced' } }));
  });

  it('hides while the calibrate confirm popup is open, without being dismissed', async () => {
    await renderAdvanced();
    fireEvent.click(screen.getByRole('button', { name: /cooling\.calibrate\.button/ }));
    expect(await screen.findByText('cooling.calibrate.confirmTitle')).toBeTruthy();
    expect(bubble()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    await waitFor(() => expect(bubble()).not.toBeNull());
  });

  it('hides while the import dialog is open', async () => {
    await renderAdvanced();
    for (const trigger of document.querySelectorAll('[aria-haspopup="listbox"]')) {
      fireEvent.click(trigger);
      if (screen.queryByRole('option', { name: 'cooling.presets.importOption' })) break;
    }
    fireEvent.click(await screen.findByRole('option', { name: 'cooling.presets.importOption' }));
    expect(await screen.findByTestId('import-dialog')).toBeTruthy();
    expect(bubble()).toBeNull();
  });

  it('hides while the mode menu is open', async () => {
    await renderAdvanced();
    fireEvent.click(screen.getByRole('tab', { name: /uiMode\.advanced/ }));
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(bubble()).toBeNull();
  });
});
