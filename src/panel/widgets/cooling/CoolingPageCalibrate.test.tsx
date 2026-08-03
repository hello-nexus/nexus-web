import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [{
        id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Auto',
        classification: 'Controllable', calibrated: true,
      }],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    startCalibration: vi.fn(async () => ({ error: false })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
  };
});

import { startCalibration } from '../../../api/cooling';

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

async function clickCalibrate() {
  render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
  const btn = await screen.findByRole('button', { name: /cooling\.calibrate\.button/ });
  fireEvent.click(btn);
  return btn;
}

describe('CoolingPage calibrate confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('explains the run instead of starting it when Calibrate is pressed', async () => {
    await clickCalibrate();
    expect(await screen.findByText('cooling.calibrate.confirmTitle')).toBeTruthy();
    expect(screen.getByText('cooling.calibrate.confirmMessage')).toBeTruthy();
    // The duration/lock warning rides the modal's note slot.
    expect(screen.getByText('cooling.calibrate.locked')).toBeTruthy();
    expect(startCalibration).not.toHaveBeenCalled();
  });

  it('starts calibration only after the confirm button', async () => {
    await clickCalibrate();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.calibrate.confirmStart' }));
    await waitFor(() => expect(startCalibration).toHaveBeenCalledTimes(1));
  });

  it('leaves calibration unstarted when the dialog is cancelled', async () => {
    await clickCalibrate();
    fireEvent.click(await screen.findByRole('button', { name: 'confirm.cancel' }));
    await waitFor(() => expect(screen.queryByText('cooling.calibrate.confirmTitle')).toBeNull());
    expect(startCalibration).not.toHaveBeenCalled();
  });
});
