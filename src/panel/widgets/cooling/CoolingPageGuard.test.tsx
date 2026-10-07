import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  managed: false,
  keepFails: false,
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
      curves: [...(svc.managed ? [{
        id: 'guard-cpu', name: 'Thermal guard', type: 'Graph',
        input: { id: 'cpu-package', type: 'Temperature', device: '' },
        outputs: [], graph: { responseTime: 1.5, speedModifier: 1, points: [{ temp: 30, speed: 30 }, { temp: 90, speed: 100 }] },
      }] : []), {
        id: 'curve-bravo', name: 'Bravo', type: 'Linear',
        input: { id: 'cpu-package', type: 'Temperature', device: '' },
        outputs: [],
        linear: { responseTime: 1.5, minTemp: 30, maxTemp: 70, minSpeed: 20, maxSpeed: 80 },
      }],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => ({ error: false, msg: '' })),
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
    fetchGuard: vi.fn(async () => ({ ...svc.guard, hazards: svc.hazards })),
    setGuardConfig: vi.fn(async ({ enabled }: { enabled?: boolean }) => {
      svc.guard = { ...svc.guard, state: enabled ? 'normal' : 'off' };
      return svc.guard;
    }),
    undoHeal: vi.fn(async () => ({ undoAvailable: false, healedAtUtcMs: null, channels: [] })),
    keepHeal: vi.fn(async () => (svc.keepFails ? null : { undoAvailable: false, healedAtUtcMs: null, channels: [] })),
  };
});

import { saveCurves, undoHeal, keepHeal } from '../../../api/cooling';

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
    svc.managed = false;
    svc.keepFails = false;
    svc.guard = {
      state: 'normal', guardTempC: 55, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
      heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
    };
  });

  it('saves straight away, with no prompt, even when the service reports hazards', async () => {
    svc.hazards = [hazard];
    renderAdvanced();
    await triggerSave();
    await waitFor(() => { expect(vi.mocked(saveCurves)).toHaveBeenCalled(); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('flags a hazardous fan with a warning triangle that carries the reason', async () => {
    svc.hazards = [hazard];
    renderAdvanced();
    expect(await screen.findByRole('button', { name: /cooling\.guard\.hazard\.followsSource/ })).toBeTruthy();
  });

  it('shows no triangle without hazards', async () => {
    renderAdvanced();
    await screen.findByText('1,400');
    expect(screen.queryByRole('button', { name: /cooling\.guard\.hazard/ })).toBeNull();
  });

  it('renders no guard switch on the Cooling page', async () => {
    renderAdvanced();
    await screen.findByText('1,400');
    expect(screen.queryByRole('switch', { name: 'cooling.guard.label' })).toBeNull();
  });

  it('shows nothing for the guard while it is off', async () => {
    svc.guard = { ...svc.guard, state: 'off' };
    renderAdvanced();
    await screen.findByText('1,400');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the guard notices below the tabs, not above them', async () => {
    svc.guard = { ...svc.guard, watchdogLatched: true };
    renderAdvanced();
    const notice = await screen.findByText('cooling.guard.latched');
    const tab = screen.getAllByRole('tab')[0];
    expect(tab.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the guard notices below the tabs in simple mode too', async () => {
    svc.guard = { ...svc.guard, watchdogLatched: true };
    localStorage.setItem('nexus_settings', JSON.stringify({
      general: { coolingDashboardMode: 'simple', lightingDashboardMode: 'simple' },
    }));
    render(
      <UiSettingsProvider>
        <CoolingPage serviceOnline serviceState={serviceState} />
      </UiSettingsProvider>,
    );
    const notice = await screen.findByText('cooling.guard.latched');
    const tab = screen.getAllByRole('tab')[0];
    expect(tab.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the thermal guard curve read-only with a managed note', async () => {
    svc.managed = true;
    renderAdvanced();
    expect(await screen.findByText('cooling.guard.managedCurve')).toBeTruthy();
    // Every control in the card is disabled, not merely unclickable.
    for (const radio of screen.getAllByRole('radio', { name: /cooling\.curve\.type\./ })) expect(radio).toBeDisabled();
    expect(screen.getByRole('button', { name: /cooling\.curves\.renameBtn/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cooling\.curves\.removeBtn/ })).toBeDisabled();
    for (const slider of screen.getAllByRole('slider')) expect(slider).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'cooling.curve.type.trigger' }));
    await act(async () => {});
    expect(vi.mocked(saveCurves)).not.toHaveBeenCalled();
  });

  it('shows no managed note on an ordinary curve', async () => {
    renderAdvanced();
    await screen.findByText('1,400');
    expect(screen.queryByText('cooling.guard.managedCurve')).toBeNull();
  });

  it('shows the latched banner when the watchdog latched', async () => {
    svc.guard = { ...svc.guard, watchdogLatched: true };
    renderAdvanced();
    expect(await screen.findByText('cooling.guard.latched')).toBeTruthy();
  });

  const healedGuard = () => {
    svc.guard = {
      ...svc.guard,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'fan-top', name: 'Top Fan', hazard: 'manual-low' }] },
    };
  };

  it('Keep calls the keep route and the notice clears', async () => {
    healedGuard();
    renderAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.keep' }));
    await waitFor(() => { expect(vi.mocked(keepHeal)).toHaveBeenCalled(); });
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'cooling.guard.heal.keep' })).toBeNull(); });
    expect(screen.queryByRole('button', { name: 'cooling.guard.heal.undo' })).toBeNull();
  });

  it('a failed Keep shows an inline error and keeps the notice', async () => {
    svc.keepFails = true;
    healedGuard();
    renderAdvanced();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.keep' }));
    await screen.findByText('cooling.guard.error.keep');
    expect(screen.getByRole('button', { name: 'cooling.guard.heal.keep' })).toBeTruthy();
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
