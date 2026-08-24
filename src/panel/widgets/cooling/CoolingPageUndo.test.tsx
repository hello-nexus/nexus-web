import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

// The service remembers the applied mode, so fetchProfiles must echo it back.
// A fixed 'custom' would let the page's own refresh revert the mode mid-test.
const svc = vi.hoisted(() => ({ active: 'custom' }));

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
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: svc.active })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async (name: string) => { svc.active = name; return undefined; }),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
    setFanLock: vi.fn(async () => undefined),
    setFanOffset: vi.fn(async () => undefined),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    createCoolingPreset: vi.fn(async () => ({ preset: null, activeId: null, error: false, msg: 'Ok' })),
    updateCoolingPreset: vi.fn(async () => undefined),
    deleteCoolingPreset: vi.fn(async () => ({ activeId: null })),
    activateCoolingPreset: vi.fn(async () => undefined),
  };
});

import { applyProfile } from '../../../api/cooling';

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

const undoBtn = () => screen.getByRole('button', { name: /cooling\.presets\.undo/ });
const redoBtn = () => screen.getByRole('button', { name: /cooling\.presets\.redo/ });

describe('CoolingPage undo/redo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.active = 'custom';
  });

  it('renders the history controls in the preset toolbar', async () => {
    renderAdvanced();
    await screen.findByRole('tab', { name: /cooling\.mode\.turbo/ });
    expect(undoBtn()).toBeTruthy();
    expect(redoBtn()).toBeTruthy();
  });

  it('starts with nothing to undo or redo', async () => {
    renderAdvanced();
    await screen.findByRole('tab', { name: /cooling\.mode\.turbo/ });
    expect(undoBtn()).toBeDisabled();
    expect(redoBtn()).toBeDisabled();
  });

  it('enables undo after a mode change, and reverts it', async () => {
    renderAdvanced();
    // Wait for the loaded mode to land: a snapshot taken before it does has a
    // null mode, and undo then correctly leaves the mode alone.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /cooling\.mode\.custom/ }).getAttribute('aria-selected')).toBe('true');
    });
    fireEvent.click(screen.getByRole('tab', { name: /cooling\.mode\.turbo/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('turbo');
    });
    await waitFor(() => { expect(undoBtn()).not.toBeDisabled(); });

    vi.mocked(applyProfile).mockClear();
    fireEvent.click(undoBtn());
    // The snapshot captured 'custom' as the mode before the change.
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('custom');
    });
  });

  it('enables redo once an undo has been taken', async () => {
    renderAdvanced();
    const turbo = await screen.findByRole('tab', { name: /cooling\.mode\.turbo/ });
    fireEvent.click(turbo);
    await waitFor(() => { expect(undoBtn()).not.toBeDisabled(); });
    fireEvent.click(undoBtn());
    await waitFor(() => { expect(redoBtn()).not.toBeDisabled(); });
  });

  it('offers a reset that returns fans to BIOS', async () => {
    renderAdvanced();
    await screen.findByRole('tab', { name: /cooling\.mode\.turbo/ });
    const reset = screen.getByRole('button', { name: /cooling\.presets\.reset/ });
    expect(reset).toBeTruthy();
    fireEvent.click(reset);
    // Reset is destructive, so it routes through a confirm dialog first.
    expect(await screen.findByText('cooling.presets.resetConfirm')).toBeTruthy();
  });
});
