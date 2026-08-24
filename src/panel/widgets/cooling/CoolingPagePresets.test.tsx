import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const presetState = vi.hoisted(() => ({
  presets: [
    { id: 'p1', name: 'Quiet night', mode: 'custom' },
    { id: 'p2', name: 'Bench', mode: 'turbo' },
  ],
  activeId: 'p1' as string | null,
}));

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
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
    setFanLock: vi.fn(async () => undefined),
    fetchCoolingPresets: vi.fn(async () => ({
      presets: presetState.presets,
      activeId: presetState.activeId,
    })),
    createCoolingPreset: vi.fn(async () => ({
      preset: { id: 'p3', name: 'New', mode: 'custom' }, activeId: 'p3', error: false,
    })),
    updateCoolingPreset: vi.fn(async () => undefined),
    deleteCoolingPreset: vi.fn(async () => ({ activeId: null })),
    activateCoolingPreset: vi.fn(async () => undefined),
  };
});

import {
  activateCoolingPreset, updateCoolingPreset, applyProfile,
} from '../../../api/cooling';

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

describe('CoolingPage saved presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    presetState.activeId = 'p1';
  });

  it('lists the saved presets in the header toolbar', async () => {
    renderAdvanced();
    expect(await screen.findByText('Quiet night')).toBeTruthy();
  });

  it('activates a preset when one is picked', async () => {
    renderAdvanced();
    await screen.findByText('Quiet night');
    fireEvent.click(screen.getByText('Quiet night'));
    fireEvent.click(await screen.findByText('Bench'));
    await waitFor(() => {
      expect(vi.mocked(activateCoolingPreset)).toHaveBeenCalledWith('p2');
    });
  });

  it('writes a configuration change through into the loaded preset', async () => {
    renderAdvanced();
    await screen.findByText('Quiet night');
    vi.mocked(updateCoolingPreset).mockClear();
    fireEvent.click(screen.getByRole('tab', { name: /cooling\.mode\.turbo/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('turbo');
      expect(vi.mocked(updateCoolingPreset)).toHaveBeenCalledWith('p1', { saveCurrent: true });
    });
  });

  it('does not write through when no preset is loaded', async () => {
    presetState.activeId = null;
    renderAdvanced();
    await screen.findByText('cooling.presets.placeholder');
    vi.mocked(updateCoolingPreset).mockClear();
    fireEvent.click(screen.getByRole('tab', { name: /cooling\.mode\.turbo/ }));
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('turbo');
    });
    expect(vi.mocked(updateCoolingPreset)).not.toHaveBeenCalled();
  });
});
