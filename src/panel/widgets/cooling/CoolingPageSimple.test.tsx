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
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Manual',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-rear', name: 'Rear Fan', dutyPercent: 30, rpm: 900, mode: 'Auto',
          classification: 'Controllable', calibrated: true, locked: true,
        },
      ],
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
    setFanLock: vi.fn(async () => undefined),
  };
});

import { applyProfile, setFanLock } from '../../../api/cooling';

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

function renderPage() {
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

describe('CoolingPage simple mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh install: no stored settings, both page modes default to 'simple'.
    localStorage.clear();
  });

  it('renders the four preset tiles without the custom preset or advanced chrome', () => {
    renderPage();
    // Tile names concatenate the label and the description line.
    for (const key of ['off', 'silent', 'balanced', 'turbo']) {
      expect(screen.getByRole('button', { name: new RegExp(`cooling\\.preset\\.${key}\\b`) })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /cooling\.preset\.custom/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /cooling\.calibrate\.button/ })).toBeNull();
    expect(screen.getByRole('button', { name: /cooling\.simple\.advancedCta/ })).toBeTruthy();
  });

  it('summarises how many fans are detected and driven', async () => {
    renderPage();
    expect(await screen.findByText('cooling.simple.detected.other')).toBeTruthy();
    expect(screen.getByText('cooling.simple.controlled')).toBeTruthy();
  });

  it('unlocks a fan the preset buttons would otherwise skip', async () => {
    renderPage();
    await waitFor(() => {
      expect(vi.mocked(setFanLock)).toHaveBeenCalledWith('fan-rear', false);
    });
    expect(vi.mocked(setFanLock).mock.calls.some(c => c[0] === 'fan-cpu')).toBe(false);
  });

  it('applies a preset from its tile', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /cooling\.preset\.silent\b/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('silent');
    });
  });

  it('switches to the advanced page from the CTA', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /cooling\.simple\.advancedCta/ }));
    expect(await screen.findByRole('button', { name: /cooling\.calibrate\.button/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cooling\.simple\.advancedCta/ })).toBeNull();
  });
});
