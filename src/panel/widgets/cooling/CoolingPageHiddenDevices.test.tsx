import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Manual',
          classification: 'Controllable', calibrated: true, controlled: true,
        },
        // The motherboard or a vendor app owns this one.
        {
          id: 'fan-vendor', name: 'Vendor Fan', dutyPercent: 30, rpm: 900, mode: 'Auto',
          classification: 'Controllable', calibrated: true, controlled: false,
        },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    setFanControlled: vi.fn(async () => undefined),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
  };
});

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

function renderAdvanced() {
  localStorage.setItem('nexus_settings', JSON.stringify({
    general: { coolingDashboardMode: 'advanced', lightingDashboardMode: 'advanced' },
  }));
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

describe('CoolingPage hides fans without Nexus Control', () => {
  it('lists every fan until the eye closes, then drops the uncontrolled one', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    // Eye open is the default, so nothing is hidden yet.
    expect(screen.getByText('Vendor Fan')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('devices.hidden.hide'));

    await waitFor(() => expect(screen.queryByText('Vendor Fan')).not.toBeInTheDocument());
    // The fan Nexus does drive is untouched, and the control flips to "show".
    expect(screen.getByText('CPU Fan')).toBeInTheDocument();
    expect(screen.getByLabelText('devices.hidden.show')).toBeInTheDocument();
  });
});
