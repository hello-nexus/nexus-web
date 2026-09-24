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
          classification: 'Controllable', calibrated: true, locked: true, controlled: false,
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
    setFanControlled: vi.fn(async () => undefined),
  };
});

import { applyProfile, setFanControlled, setFanLock } from '../../../api/cooling';

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

  it('renders the three speed tiles without the custom mode or advanced chrome', () => {
    renderPage();
    // Tile names concatenate the label and the description line.
    for (const key of ['silent', 'balanced', 'turbo']) {
      expect(screen.getByRole('button', { name: new RegExp(`cooling\\.mode\\.${key}\\b`) })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /cooling\.mode\.custom/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /cooling\.calibrate\.button/ })).toBeNull();
    // Simple mode carries the mode tab and nothing after it; Off lives in it.
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab'));
    expect(screen.getByRole('menuitemradio', { name: /cooling\.mode\.off/ })).toBeTruthy();
  });

  it('summarises how many fans Nexus controls out of the total', async () => {
    renderPage();
    expect(await screen.findByText('cooling.simple.controlledOf.other')).toBeTruthy();
  });

  it('offers a one-click claim while a fan has Nexus Control off, and drops it once none do', async () => {
    renderPage();
    const claim = await screen.findByRole('button', { name: 'cooling.simple.controlAll' });
    fireEvent.click(claim);
    await waitFor(() => {
      expect(vi.mocked(setFanControlled)).toHaveBeenCalledWith('fan-rear', true);
    });
    // Only the fan that was actually off is claimed.
    expect(vi.mocked(setFanControlled).mock.calls.some(c => c[0] === 'fan-cpu')).toBe(false);
  });

  it('writes no lock override on open or on a mode click', async () => {
    renderPage();
    // Locked is the service's default for pumps, GPU and AIO channels.
    await screen.findByText('cooling.simple.controlledOf.other');
    fireEvent.click(screen.getByRole('button', { name: /cooling\.mode\.silent\b/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('silent');
    });
    expect(vi.mocked(setFanLock)).not.toHaveBeenCalled();
  });

  it('applies a mode from its tile', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /cooling\.mode\.silent\b/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('silent');
    });
  });

  it('switches to the advanced page from the mode menu', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /uiMode\.advancedMode/ }));
    expect(await screen.findByRole('button', { name: /cooling\.calibrate\.button/ })).toBeTruthy();
    // The advanced page's own tab strip: the mode tab plus every mode after it.
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
  });
});
