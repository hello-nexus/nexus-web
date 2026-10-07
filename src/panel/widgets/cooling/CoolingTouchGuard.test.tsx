import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingTouch } from './CoolingTouch';
import type { PanelWidget } from '../../types';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const svc = vi.hoisted(() => ({
  hazards: [] as Array<Record<string, unknown>>,
  undoAvailable: true,
  undoResult: 'ok' as 'ok' | 'fail',
  keepResult: 'ok' as 'ok' | 'fail',
  managedFirst: false,
}));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Curve',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-case', name: 'Case Fan', dutyPercent: 30, rpm: 820, mode: 'Auto',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-dead', name: 'Dead Header', dutyPercent: 0, rpm: 0, mode: 'Auto',
          classification: 'Unresponsive', calibrated: true,
        },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [
        { id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 },
        { id: 'gpu-core', name: 'GPU Core', category: 'GPU', value: 47 },
      ],
    })),
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [
        ...(svc.managedFirst ? [{
          id: 'guard-cpu', name: 'Thermal guard', type: 'Graph',
          input: { id: 'cpu-package', type: 'Temperature', device: '' },
          outputs: [], flat: null, linear: null,
          graph: { responseTime: 1.5, speedModifier: 1, points: [{ temp: 30, speed: 30 }, { temp: 90, speed: 100 }] },
          mixed: null, preset: null, isDefault: null,
        }] : []),
        {
          id: 'curve-1', name: 'My Graph Curve', type: 'Graph',
          input: { id: 'cpu-package', type: 'Temperature', device: '' },
          outputs: [{ id: 'fan-cpu', type: 'Fan' }],
          flat: null,
          linear: null,
          graph: {
            responseTime: 1.5, speedModifier: 1,
            points: [
              { temp: 30, speed: 25 }, { temp: 50, speed: 40 },
              { temp: 70, speed: 70 }, { temp: 90, speed: 100 },
            ],
          },
          mixed: null,
          preset: null,
          isDefault: null,
        },
      ],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => ({ error: false, msg: '' })),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    resetPresetCurve: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
    lintCurves: vi.fn(async () => ({ hazards: svc.hazards, fixAvailable: svc.hazards.length > 0 })),
    healCooling: vi.fn(async () => ({ undoAvailable: svc.undoAvailable, healedAtUtcMs: 1, channels: [{ id: 'fan-case', name: 'Case Fan', hazard: 'manual-low' }] })),
    undoHeal: vi.fn(async () => (svc.undoResult === 'ok' ? { undoAvailable: false, healedAtUtcMs: null, channels: [] } : null)),
    keepHeal: vi.fn(async () => (svc.keepResult === 'ok' ? { undoAvailable: false, healedAtUtcMs: null, channels: [] } : null)),
    fetchGuard: vi.fn(async () => ({
      state: 'normal', guardTempC: 50, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
      heal: { undoAvailable: svc.undoAvailable, healedAtUtcMs: null, channels: [] },
    })),
  };
});

vi.mock('../../../api/np50', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/np50')>();
  return { ...original, getNp50ConnectionState: vi.fn(async () => null) };
});

import { saveCurves, healCooling, undoHeal, keepHeal } from '../../../api/cooling';

const widget = { id: 'w-cooling', type: 'cooling', size: '4x4', col: 0, row: 0 } as PanelWidget;
const hazard = {
  channelId: 'fan-case', channelName: 'Case Fan', kind: 'follows-stoppable-source', rootId: 'g', rootName: 'GPU Fan 1',
};

async function triggerSave() {
  localStorage.setItem('nexus.cooling.selectedFans', JSON.stringify(['fan-case']));
  render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'My Graph Curve' }));
}

describe('CoolingTouch curve save lint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.hazards = [];
    svc.undoAvailable = true;
    svc.undoResult = 'ok';
    svc.keepResult = 'ok';
    svc.managedFirst = false;
  });

  it('saves straight away without hazards', async () => {
    await triggerSave();
    await waitFor(() => expect(saveCurves).toHaveBeenCalled());
    expect(screen.queryByText('cooling.guard.dialog.title')).toBeNull();
    expect(healCooling).not.toHaveBeenCalled();
  });

  it('holds the save behind the warning when there are hazards', async () => {
    svc.hazards = [hazard];
    await triggerSave();
    await screen.findByText('cooling.guard.dialog.title');
    expect(saveCurves).not.toHaveBeenCalled();
  });

  it('Fix saves, then heals', async () => {
    svc.hazards = [hazard];
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await waitFor(() => expect(healCooling).toHaveBeenCalled());
    expect(vi.mocked(saveCurves).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(healCooling).mock.invocationCallOrder[0]);
    // What changed is shown, with Undo.
    expect(await screen.findByText('cooling.guard.heal.title')).toBeTruthy();
    expect(screen.getByText('cooling.guard.hazard.manualLow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.undo' }));
    await waitFor(() => expect(undoHeal).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('cooling.guard.heal.title')).toBeNull());
  });

  it('Save anyway saves without healing', async () => {
    svc.hazards = [hazard];
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.saveAnyway' }));
    await waitFor(() => expect(saveCurves).toHaveBeenCalled());
    expect(healCooling).not.toHaveBeenCalled();
  });

  async function fixOnce() {
    svc.hazards = [hazard];
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await screen.findByText('cooling.guard.heal.title');
  }

  it('Keep calls the route and clears the notice', async () => {
    await fixOnce();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.keep' }));
    await waitFor(() => expect(keepHeal).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('cooling.guard.heal.title')).toBeNull());
  });

  it('a failed Keep shows the inline error and keeps the notice', async () => {
    svc.keepResult = 'fail';
    await fixOnce();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.keep' }));
    await screen.findByText('cooling.guard.error.keep');
    expect(screen.getByText('cooling.guard.heal.title')).toBeTruthy();
  });

  it('clears the heal notice on the next successful save', async () => {
    await fixOnce();
    svc.hazards = [];
    fireEvent.click(screen.getByRole('button', { name: 'My Graph Curve' }));
    await waitFor(() => expect(saveCurves).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('cooling.guard.heal.title')).toBeNull());
  });

  it('hides the notice once the service no longer holds a snapshot', async () => {
    svc.undoAvailable = false;
    svc.hazards = [hazard];
    await triggerSave();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.dialog.fix' }));
    await waitFor(() => expect(healCooling).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('cooling.guard.heal.title')).toBeNull();
  });

  it('keeps the notice and shows an inline error when Undo fails', async () => {
    svc.undoResult = 'fail';
    await fixOnce();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.undo' }));
    await screen.findByText('cooling.guard.error.undo');
    expect(screen.getByText('cooling.guard.heal.title')).toBeTruthy();
  });

  it('shows a failed save inline with no toast provider', async () => {
    vi.mocked(saveCurves).mockResolvedValueOnce(null as never);
    await triggerSave();
    await screen.findByText('cooling.guard.error.save');
  });

  it('a successful save clears a failed-undo error', async () => {
    svc.undoResult = 'fail';
    await fixOnce();
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.undo' }));
    await screen.findByText('cooling.guard.error.undo');
    svc.hazards = [];
    fireEvent.click(screen.getByRole('button', { name: 'My Graph Curve' }));
    await waitFor(() => expect(screen.queryByText('cooling.guard.error.undo')).toBeNull());
  });

  it('shows the thermal guard curve read-only with a managed note', async () => {
    svc.managedFirst = true;
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    expect(await screen.findByText('cooling.guard.managedCurve')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'cooling.curve.type.trigger' }));
    await act(async () => {});
    expect(saveCurves).not.toHaveBeenCalled();
  });

  it('shows no managed note on an ordinary curve', async () => {
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    await screen.findByRole('button', { name: 'My Graph Curve' });
    expect(screen.queryByText('cooling.guard.managedCurve')).toBeNull();
  });
});
