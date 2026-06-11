import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingTouch } from './CoolingTouch';
import type { PanelWidget } from '../../types';

// The immersive view renders outside I18nProvider in tests, so t() falls back
// to raw keys - assertions below match keys, not English strings.

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
  };
});

vi.mock('../../../api/np50', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/np50')>();
  return {
    ...original,
    getNp50ConnectionState: vi.fn(async () => null),
    setNp50FirmwareControl: vi.fn(async () => undefined),
    setNp50LiveCoolingMode: vi.fn(async () => undefined),
  };
});

vi.mock('../../../api/minihub', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/minihub')>();
  return {
    ...original,
    setMiniHubLiveCoolingMode: vi.fn(async () => undefined),
  };
});

import { applyProfile } from '../../../api/cooling';

const widget = { id: 'w-cooling', type: 'cooling', size: '4x4', col: 0, row: 0 } as PanelWidget;

function renderTouch() {
  return render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
}

describe('CoolingTouch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders preset mode buttons with the active preset hydrated from /cooling/profiles', async () => {
    renderTouch();
    const balanced = await screen.findByRole('button', { name: 'cooling.preset.balanced' });
    await waitFor(() => expect(balanced).toHaveAttribute('aria-pressed', 'true'));
    for (const key of ['off', 'silent', 'turbo', 'custom']) {
      expect(screen.getByRole('button', { name: `cooling.preset.${key}` }))
        .toHaveAttribute('aria-pressed', 'false');
    }
    // Live trend chart frames cell 1 under the buttons: title hidden in the
    // immersive (too narrow), the CPU/GPU legend carries the row instead.
    expect(screen.queryByText('cooling.trend.title')).toBeNull();
    expect(screen.getByText('cooling.status.cpu')).toBeInTheDocument();
    expect(screen.getByText('cooling.status.gpu')).toBeInTheDocument();
  });

  it('shows the Curves | Fans tabs with curve cards on the default tab', async () => {
    renderTouch();
    const curvesTab = await screen.findByRole('tab', { name: 'cooling.sections.curves' });
    expect(curvesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'cooling.label.fan' })).toBeInTheDocument();
    expect(await screen.findByText('My Graph Curve')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cooling.curves.add/ })).toBeInTheDocument();
  });

  it('lists connected fans on the Fans tab and hides unresponsive hardware', async () => {
    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'cooling.label.fan' }));
    expect(await screen.findByText('CPU Fan')).toBeInTheDocument();
    expect(screen.getByText('Case Fan')).toBeInTheDocument();
    expect(screen.queryByText('Dead Header')).toBeNull();
  });

  it('applies a preset optimistically on tap', async () => {
    renderTouch();
    const turbo = await screen.findByRole('button', { name: 'cooling.preset.turbo' });
    fireEvent.click(turbo);
    expect(turbo).toHaveAttribute('aria-pressed', 'true');
    expect(applyProfile).toHaveBeenCalledWith('turbo');
  });
});
