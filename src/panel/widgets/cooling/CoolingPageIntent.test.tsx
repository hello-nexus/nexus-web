import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Which source/target the cooling writes carry decides what telemetry counts as a user choice.
// Rendered outside I18nProvider, so t() falls back to raw keys.

// The service remembers the applied mode, so fetchProfiles must echo it back.
// A fixed 'custom' would let the page's own refresh revert the mode mid-test.
const svc = vi.hoisted(() => ({ active: 'custom', fanMode: 'Auto' }));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: svc.fanMode,
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
    setFanPin: vi.fn(async () => undefined),
    setFanOffset: vi.fn(async () => undefined),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    createCoolingPreset: vi.fn(async () => ({ preset: null, activeId: null, error: false, msg: 'Ok' })),
    updateCoolingPreset: vi.fn(async () => undefined),
    deleteCoolingPreset: vi.fn(async () => ({ activeId: null })),
    activateCoolingPreset: vi.fn(async () => undefined),
  };
});

import { applyProfile, setFanSpeed } from '../../../api/cooling';

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

async function pickMode(label: RegExp) {
  const trigger = await screen.findByRole('button', { name: /cooling\.card\.mode/ });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('CoolingPage telemetry intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.active = 'custom';
    svc.fanMode = 'Auto';
  });

  it('marks the speed written when a BIOS fan is taken to manual as a seed', async () => {
    renderAdvanced();
    await pickMode(/cooling\.card\.manual/);
    await waitFor(() => {
      expect(vi.mocked(setFanSpeed)).toHaveBeenCalledWith('fan-cpu', 50, { source: 'seed', target: 'manual' });
    });
  });

  it('marks the preset change that leaves Off as exit-off', async () => {
    svc.active = 'off';
    renderAdvanced();
    await waitFor(() => { expect(vi.mocked(applyProfile)).not.toHaveBeenCalled(); });
    await pickMode(/cooling\.card\.manual/);
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('custom', 'exit-off');
    });
  });

  it('marks a history replay of fan speeds and mode as undo', async () => {
    svc.fanMode = 'Manual';
    renderAdvanced();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /cooling\.mode\.custom/ }).getAttribute('aria-selected')).toBe('true');
    });
    fireEvent.click(screen.getByRole('tab', { name: /cooling\.mode\.turbo/ }));
    const undo = screen.getByRole('button', { name: /cooling\.presets\.undo/ });
    await waitFor(() => { expect(undo).not.toBeDisabled(); });
    vi.mocked(applyProfile).mockClear();
    vi.mocked(setFanSpeed).mockClear();
    fireEvent.click(undo);
    await waitFor(() => {
      expect(vi.mocked(applyProfile)).toHaveBeenCalledWith('custom', 'undo');
      expect(vi.mocked(setFanSpeed)).toHaveBeenCalledWith('fan-cpu', expect.any(Number), { source: 'undo' });
    });
  });
});
