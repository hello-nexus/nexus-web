import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        { id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Auto', classification: 'Controllable', calibrated: true },
        { id: 'fan-dead', name: 'Dead Fan', dutyPercent: 0, rpm: 0, mode: 'Auto', classification: 'Unresponsive', calibrated: true },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    fetchCalibrationResults: vi.fn(async () => ({
      calibrations: [
        { fanId: 'fan-cpu', classification: 'Controllable', minRpm: 400, maxRpm: 1800 },
        { fanId: 'fan-dead', classification: 'Unresponsive', minRpm: 0, maxRpm: 0 },
      ],
    })),
  };
});

import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

const stateWith = (calibrationState: string) =>
  ({ cooling: { calibrating: false, calibrationState } }) as unknown as ServiceState;

function page(state: ServiceState) {
  return (
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={state} />
    </UiSettingsProvider>
  );
}

describe('CoolingPage calibration report', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  });

  it('puts an unplug icon before the label on the Unresponsive chip only', async () => {
    const { rerender } = render(page(stateWith('running')));
    await screen.findByText('CPU Fan');
    rerender(page(stateWith('complete')));
    const label = await screen.findByText('cooling.calibrate.class.unresponsive');
    expect(label.querySelector('svg.lucide-unplug')).not.toBeNull();
    expect(label.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText(/400-1800 RPM/).querySelector('svg')).toBeNull();
  });
});
