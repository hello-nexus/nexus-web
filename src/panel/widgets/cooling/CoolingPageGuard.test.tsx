import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const svc = vi.hoisted(() => ({
  guard: {
    state: 'normal', guardTempC: 55, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
    heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] as Array<{ id: string; name: string; hazard: string }> },
  } as Record<string, unknown>,
  hazards: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        { id: 'fan-top', name: 'Top Fan', dutyPercent: 55, rpm: 1400, mode: 'Manual', classification: 'Controllable', calibrated: true },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [{
        id: 'curve-bravo', name: 'Bravo', type: 'Linear',
        input: { id: 'cpu-package', type: 'Temperature', device: '' },
        outputs: [],
        linear: { responseTime: 1.5, minTemp: 30, maxTemp: 70, minSpeed: 20, maxSpeed: 80 },
      }],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async () => undefined),
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
    fetchGuard: vi.fn(async () => svc.guard),
    setGuardEnabled: vi.fn(async (enabled: boolean) => {
      svc.guard = { ...svc.guard, state: enabled ? 'normal' : 'off' };
      return svc.guard;
    }),
    lintCurves: vi.fn(async () => ({ hazards: svc.hazards, fixAvailable: svc.hazards.length > 0 })),
    healCooling: vi.fn(async () => ({
      undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'fan-top', name: 'Top Fan', hazard: 'manual-low' }],
    })),
    undoHeal: vi.fn(async () => ({ undoAvailable: false, healedAtUtcMs: null, channels: [] })),
  };
});

import { saveCurves, lintCurves, healCooling, undoHeal, setGuardEnabled } from '../../../api/cooling';

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

/** Binds Bravo to the selected fan, which saves the curves. */
async function triggerSave() {
  await screen.findByText('1,400');
  fireEvent.click(screen.getByText('1,400'));
  const chips = await screen.findByRole('group', { name: 'cooling.sections.curves' });
  fireEvent.click(within(chips).getByRole('button', { name: /Bravo/ }));
}

const hazard = {
  channelId: 'fan-top', channelName: 'Fan #1', kind: 'follows-stoppable-source', rootId: 'gpu-fan', rootName: 'GPU Fan 1',
};

describe('CoolingPage thermal guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.hazards = [];
    svc.guard = {
      state: 'normal', guardTempC: 55, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
      heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
    };
  });

  it('saves straight away when the lint finds no hazards', async () => {
    renderAdvanced();
    await triggerSave();
    await waitFor(() => { expect(vi.mocked(saveCurves)).toHaveBeenCalled(); });
    expect(vi.mocked(lintCurves)).toHaveBeenCalled();
    expect(screen.queryByText('cooling.guard.dialog.title')).toBeNull();
    expect(vi.mocked(healCooling)).not.toHaveBeenCalled();
  });

  it('lists each hazard in a dialog and holds the save until a choice is made', async () => {
    svc.hazards = [hazard];
    renderAdvanced();
    await triggerSave();
    await screen.findByText('cooling.guard.dialog.title');
    expect(screen.getByText('cooling.guard.hazard.followsSource')).toBeTruthy();
    expect(vi.mocked(saveCurves)).not.toHaveBeenCalled();
  });

  it('Fix saves, then heals', async () => {
    svc.hazards = [hazard];
    renderAdvanced();
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await waitFor(() => { expect(vi.mocked(healCooling)).toHaveBeenCalled(); });
    expect(vi.mocked(saveCurves)).toHaveBeenCalled();
    expect(vi.mocked(saveCurves).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(healCooling).mock.invocationCallOrder[0]);
    // The heal result puts the notice with Undo on the page.
    expect(await screen.findByRole('button', { name: 'cooling.guard.heal.undo' })).toBeTruthy();
  });

  it('Save anyway saves without healing', async () => {
    svc.hazards = [hazard];
    renderAdvanced();
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
    await waitFor(() => { expect(vi.mocked(saveCurves)).toHaveBeenCalled(); });
    expect(vi.mocked(healCooling)).not.toHaveBeenCalled();
  });

  it('shows the guard switch on, with the limit and its source', async () => {
    renderAdvanced();
    const sw = await screen.findByRole('switch', { name: 'cooling.guard.label' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/cooling\.guard\.limit\.spec/)).toBeTruthy();
  });

  it('turning the switch off posts enabled false', async () => {
    renderAdvanced();
    fireEvent.click(await screen.findByRole('switch', { name: 'cooling.guard.label' }));
    await waitFor(() => { expect(vi.mocked(setGuardEnabled)).toHaveBeenCalledWith(false); });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'cooling.guard.label' }).getAttribute('aria-checked')).toBe('false');
    });
  });

  it('Undo calls the undo route and clears the notice', async () => {
    svc.guard = {
      ...svc.guard,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'fan-top', name: 'Top Fan', hazard: 'manual-low' }] },
    };
    renderAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.undo' }));
    await waitFor(() => { expect(vi.mocked(undoHeal)).toHaveBeenCalled(); });
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'cooling.guard.heal.undo' })).toBeNull(); });
  });
});
