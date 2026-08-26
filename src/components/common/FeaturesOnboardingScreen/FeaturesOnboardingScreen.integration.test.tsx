import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesOnboardingScreen } from './FeaturesOnboardingScreen';
import { UiSettingsProvider, useUiSettings, type UiSettingsContextValue } from '../../../hooks/useUiSettings';
import { completeFeaturesOnboarding } from '../../../api/onboarding';

// Reproduces the reported T1 bug end to end: the real UiSettingsProvider
// wrapping the real FeaturesOnboardingScreen, so both the screen's patch
// construction AND toServerPatch's serialization run unmocked - the two
// unit-level test files each mock away the other half of this pipeline.
vi.mock('../../../api/onboarding', () => ({
  completeFeaturesOnboarding: vi.fn(),
  completeLightingOnboarding: vi.fn(),
}));
vi.mock('../../../api/profiles', async (orig) => ({
  ...(await orig<typeof import('../../../api/profiles')>()),
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { fetchPreferences, savePreferences } = await import('../../../api/profiles');

const captured: { ctx: UiSettingsContextValue | null } = { ctx: null };
function CtxSpy() {
  captured.ctx = useUiSettings();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPreferences).mockResolvedValue({
    theme: { themeMode: 'dark', accentColor: '#2563eb', language: 'en' },
    features: { lighting: true, cooling: true, monitoring: true, diagnostics: true },
  } as never);
  vi.mocked(savePreferences).mockResolvedValue(undefined as never);
  vi.mocked(completeFeaturesOnboarding).mockResolvedValue({ completed: true, featuresCompleted: true });
});

afterEach(() => {
  captured.ctx = null;
  localStorage.clear();
});

describe('FeaturesOnboardingScreen + UiSettingsProvider integration', () => {
  it('disabling one pillar sends a patch for that field only, not all four', async () => {
    const flush = () => act(async () => { await Promise.resolve(); });

    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <CtxSpy />
          <FeaturesOnboardingScreen open onComplete={vi.fn()} />
        </UiSettingsProvider>,
      );
    });
    await flush();

    fireEvent.click(screen.getByRole('checkbox', { name: /cooling.title/ }));
    fireEvent.click(screen.getByText('featuresOnboarding.continue'));

    await waitFor(() => expect(completeFeaturesOnboarding).toHaveBeenCalled());
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(captured.ctx!.settings.featureCoolingEnabled).toBe(false);
    expect(captured.ctx!.settings.featureLightingEnabled).toBe(true);
    expect(captured.ctx!.settings.featureMonitoringEnabled).toBe(true);
    expect(captured.ctx!.settings.featureDiagnosticsEnabled).toBe(true);
    expect(savePreferences).toHaveBeenCalledWith({ features: { cooling: false } });
  });
});
