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
    undoHeal: vi.fn(async () => (svc.undoResult === 'ok' ? { undoAvailable: false, healedAtUtcMs: null, channels: [] } : null)),
    keepHeal: vi.fn(async () => (svc.keepResult === 'ok' ? { undoAvailable: false, healedAtUtcMs: null, channels: [] } : null)),
    fetchGuard: vi.fn(async () => ({
      state: 'normal', guardTempC: 50, limitC: 95, limitSource: 'spec', sinceUtcMs: null, lastTrip: null,
      hazards: svc.hazards,
      heal: svc.undoAvailable
        ? { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'fan-case', name: 'Case Fan', hazard: 'manual-low' }] }
        : { undoAvailable: false, healedAtUtcMs: null, channels: [] },
    })),
  };
});

vi.mock('../../../api/np50', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/np50')>();
  return { ...original, getNp50ConnectionState: vi.fn(async () => null) };
});

import { saveCurves, undoHeal, keepHeal } from '../../../api/cooling';

const widget = { id: 'w-cooling', type: 'cooling', size: '4x4', col: 0, row: 0 } as PanelWidget;
const hazard = {
  channelId: 'fan-case', channelName: 'Case Fan', kind: 'follows-stoppable-source', rootId: 'g', rootName: 'GPU Fan 1',
};

async function triggerSave() {
  localStorage.setItem('nexus.cooling.selectedFans', JSON.stringify(['fan-case']));
  render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'My Graph Curve' }));
}

describe('CoolingTouch curve save and hazards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    svc.hazards = [];
    svc.undoAvailable = false;
    svc.undoResult = 'ok';
    svc.keepResult = 'ok';
    svc.managedFirst = false;
  });

  it('saves straight away, with no prompt, even when the service reports hazards', async () => {
    svc.hazards = [hazard];
    await triggerSave();
    await waitFor(() => expect(saveCurves).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('flags a hazardous fan with a warning triangle and no other fan', async () => {
    svc.hazards = [hazard];
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    const icon = await screen.findByRole('img', { name: /cooling\.guard\.hazard\.followsSource/ });
    expect(icon).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /cooling\.guard\.hazard\.followsSource/ })).toHaveLength(1);
  });

  it('shows no triangle without hazards', async () => {
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    await screen.findByText('Case Fan');
    expect(screen.queryByRole('img', { name: /cooling\.guard\.hazard/ })).toBeNull();
  });

  it('Keep calls the route for a held heal', async () => {
    svc.undoAvailable = true;
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.keep' }));
    await waitFor(() => expect(keepHeal).toHaveBeenCalled());
  });

  it('keeps the notice and shows an inline error when Undo fails', async () => {
    svc.undoAvailable = true;
    svc.undoResult = 'fail';
    render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'cooling.guard.heal.undo' }));
    await waitFor(() => expect(undoHeal).toHaveBeenCalled());
    await screen.findByText('cooling.guard.error.undo');
    expect(screen.getByText('cooling.guard.heal.title')).toBeTruthy();
  });

  it('shows a failed save inline with no toast provider', async () => {
    vi.mocked(saveCurves).mockResolvedValueOnce(null as never);
    await triggerSave();
    await screen.findByText('cooling.guard.error.save');
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
