import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';

// Keys render raw; only the copy-name template is expanded so names can be asserted.
vi.mock('../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/i18n')>()),
  useTranslation: () => ({
    language: 'en',
    t: (key: string, p?: Record<string, string | number>) =>
      key === 'cooling.curve.sourceSplit.copyName' ? `${p?.curve} (${p?.source})` : key,
  }),
}));

// A curve owns one temp source for all its fans. Changing it with only some of
// them selected must ask first, not silently re-point the others.

const fixture = vi.hoisted(() => ({
  extraFans: [] as string[],
  name: 'Silent',
  only: null as string[] | null,
  cooling: [] as (() => void)[],
}));

vi.mock('../../../hooks/useMultiplexSocket', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useMultiplexSocket')>()),
  useTopicCallback: (topic: string, _enabled: boolean, cb: () => void) => {
    if (topic === 'cooling') fixture.cooling = [cb];
  },
}));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  const fan = (id: string, name: string, rpm: number) => ({
    id, name, dutyPercent: 40, rpm, mode: 'Curve',
    classification: 'Controllable', calibrated: true, controlled: true,
  });
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [fan('fan-a', 'Fan A', 1100), fan('fan-b', 'Fan B', 1200), fan('fan-c', 'Fan C', 1300)],
      groups: [],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [
        { id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 },
        { id: 'gpu-core', name: 'GPU Core', category: 'GPU', value: 61 },
      ],
    })),
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [{
        id: 'curve-silent', name: fixture.name, type: 'Linear',
        input: { id: 'cpu-package', type: 'Temperature', device: '' },
        outputs: (fixture.only ?? ['fan-a', 'fan-b', 'fan-c', ...fixture.extraFans]).map(id => ({ id, type: 'Fan' })),
        linear: { responseTime: 2.5, minTemp: 30, maxTemp: 70, minSpeed: 20, maxSpeed: 80 },
      }],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
  };
});

import { saveCurves } from '../../../api/cooling';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

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

const lastSave = () => {
  const calls = vi.mocked(saveCurves).mock.calls;
  return calls[calls.length - 1]?.[0] as { curves: { id: string; name: string; type: string; input: { id: string }; outputs: { id: string }[]; linear?: { responseTime: number; maxTemp: number } }[] };
};

const sourcePicker = () => screen.getByRole('button', { name: 'cooling.curve.source' });
const dialog = () => screen.queryByRole('alertdialog');

async function pickGpuSource() {
  await waitFor(() => { expect(sourcePicker()).toBeTruthy(); });
  fireEvent.click(sourcePicker());
  fireEvent.click(await screen.findByRole('option', { name: /GPU Core/ }));
}

describe('CoolingPage temp source on a shared curve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fixture.extraFans = [];
    fixture.name = 'Silent';
    fixture.only = null;
    fixture.cooling = [];
  });

  it('asks before changing the source when only some of the curve fans are selected', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(saveCurves).not.toHaveBeenCalled();
  });

  it('Apply to all changes the shared curve source', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();

    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'cooling.curve.sourceSplit.applyAll' }));

    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    const body = lastSave();
    expect(body.curves).toHaveLength(1);
    expect(body.curves[0].input.id).toBe('gpu-core');
    expect(body.curves[0].outputs.map(o => o.id).sort()).toEqual(['fan-a', 'fan-b', 'fan-c']);
    expect(dialog()).toBeNull();
  });

  it('New curve copies the curve with the new source and moves only the selected fan', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();

    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'cooling.curve.sourceSplit.newCurve' }));

    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    const body = lastSave();
    expect(body.curves).toHaveLength(2);
    const original = body.curves.find(c => c.id === 'curve-silent')!;
    const copy = body.curves.find(c => c.id !== 'curve-silent')!;
    expect(original.input.id).toBe('cpu-package');
    expect(original.outputs.map(o => o.id).sort()).toEqual(['fan-b', 'fan-c']);
    expect(copy.name).toBe('Silent (GPU Core)');
    expect(copy.type).toBe(original.type);
    expect(copy.linear).toEqual(original.linear);
    expect(copy.input.id).toBe('gpu-core');
    expect(copy.outputs.map(o => o.id)).toEqual(['fan-a']);
  });

  it('applies immediately, with no prompt, when every fan of the curve is selected', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    fireEvent.click(screen.getByText('1,200'), { ctrlKey: true });
    fireEvent.click(screen.getByText('1,300'), { ctrlKey: true });
    await pickGpuSource();

    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    expect(dialog()).toBeNull();
    expect(lastSave().curves[0].input.id).toBe('gpu-core');
  });

  it('applies immediately when no fan is selected', async () => {
    renderAdvanced();
    await pickGpuSource();

    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    expect(dialog()).toBeNull();
    expect(lastSave().curves[0].input.id).toBe('gpu-core');
  });

  it('Cancel leaves the curve and its source unchanged', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();

    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'confirm.cancel' }));

    await waitFor(() => { expect(dialog()).toBeNull(); });
    expect(saveCurves).not.toHaveBeenCalled();
    expect(sourcePicker().textContent).toContain('CPU Package');
  });

  it('prompts, and counts the fan, when a disconnected fan is still bound to the curve', async () => {
    fixture.extraFans = ['fan-gone'];
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    // All three connected fans selected, yet fan-gone would be re-pointed too.
    fireEvent.click(screen.getByText('1,100'));
    fireEvent.click(screen.getByText('1,200'), { ctrlKey: true });
    fireEvent.click(screen.getByText('1,300'), { ctrlKey: true });
    await pickGpuSource();

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(saveCurves).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'cooling.curve.sourceSplit.newCurve' }));
    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    const body = lastSave();
    expect(body.curves.find(c => c.id === 'curve-silent')!.outputs.map(o => o.id)).toEqual(['fan-gone']);
  });

  it('does not stack the source suffix when a copy of a copy is made', async () => {
    fixture.name = 'Silent (CPU Package)';
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'cooling.curve.sourceSplit.newCurve' }));
    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    expect(lastSave().curves.map(c => c.name)).toContain('Silent (GPU Core)');
  });

  it('Enter picks the highlighted New curve action, not Apply to all', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Enter' });
    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    expect(lastSave().curves).toHaveLength(2);
  });

  it('saves in place, with no copy, when a refresh leaves the selection owning every fan', async () => {
    renderAdvanced();
    await waitFor(() => { expect(screen.getByText('1,100')).toBeTruthy(); });
    fireEvent.click(screen.getByText('1,100'));
    await pickGpuSource();
    const dlg = await screen.findByRole('alertdialog');

    fixture.only = ['fan-a'];
    await act(async () => { fixture.cooling[0]?.(); });
    // The curve chip's fan count drops from 3 to 1 once the refresh lands.
    await waitFor(() => {
      expect(document.querySelector('[class*="curveBtnCount"]')?.textContent?.trim()).toBe('1');
    });

    fireEvent.click(within(dlg).getByRole('button', { name: 'cooling.curve.sourceSplit.newCurve' }));
    await waitFor(() => { expect(saveCurves).toHaveBeenCalled(); });
    const body = lastSave();
    expect(body.curves).toHaveLength(1);
    expect(body.curves[0].input.id).toBe('gpu-core');
    expect(body.curves[0].outputs.map(o => o.id)).toEqual(['fan-a']);
  });
});
