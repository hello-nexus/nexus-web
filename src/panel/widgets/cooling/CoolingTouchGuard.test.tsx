import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingTouch } from './CoolingTouch';
import type { PanelWidget } from '../../types';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const svc = vi.hoisted(() => ({ hazards: [] as Array<Record<string, unknown>> }));

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
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    resetPresetCurve: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
    lintCurves: vi.fn(async () => ({ hazards: svc.hazards, fixAvailable: svc.hazards.length > 0 })),
    healCooling: vi.fn(async () => ({ undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'fan-case', name: 'Case Fan', hazard: 'manual-low' }] })),
    undoHeal: vi.fn(async () => ({ undoAvailable: false, healedAtUtcMs: null, channels: [] })),
  };
});

vi.mock('../../../api/np50', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/np50')>();
  return { ...original, getNp50ConnectionState: vi.fn(async () => null) };
});

import { saveCurves, healCooling, undoHeal } from '../../../api/cooling';

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
});
