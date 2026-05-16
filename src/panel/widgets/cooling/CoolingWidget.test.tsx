import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { CoolingWidget } from './CoolingWidget';

const sensorFixture = vi.hoisted(() => {
  const build = () => ({
    cpu: [{ id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 58, units: 'C', formatted: '58 C', parent: { id: 'cpu', name: 'CPU' } }],
    gpu: [{ id: 'gpu-temp', name: 'GPU Core', type: 'Temperature', value: 46, units: 'C', formatted: '46 C', parent: { id: 'gpu', name: 'GPU' } }],
    memory: [],
    storage: [],
    storageComponents: {},
    storageSensors: [],
    motherboard: [
      { id: 'fan-1', name: 'Fan 1', type: 'Fan', value: 1200, units: 'RPM', formatted: '1200 RPM', parent: { id: 'mobo', name: 'Motherboard' } },
      { id: 'fan-2', name: 'Fan 2', type: 'Fan', value: 1600, units: 'RPM', formatted: '1600 RPM', parent: { id: 'mobo', name: 'Motherboard' } },
    ],
    motherboardModel: '',
    cpuModel: '',
    gpuModels: [],
    memoryTotal: '',
  });

  return { build, current: build() };
});

vi.mock('../../../api/cooling', () => ({
  applyProfile: vi.fn(() => Promise.resolve()),
  fetchProfiles: vi.fn(() => Promise.resolve({
    active: 'balanced',
    profiles: [
      { name: 'Silent' },
      { name: 'Balanced' },
      { name: 'Turbo' },
    ],
  })),
  fetchCurves: vi.fn(() => Promise.resolve({ globalSpeedModifier: 1, curves: [] })),
  fetchFanChannels: vi.fn(() => Promise.resolve({
    channels: [
      { id: 'fan-1', name: 'Fan 1', dutyPercent: 40, rpm: 1200, mode: 'Auto' },
      { id: 'fan-2', name: 'Fan 2', dutyPercent: 60, rpm: 1600, mode: 'Auto' },
    ],
  })),
  fetchTemperatureSources: vi.fn(() => Promise.resolve({ sources: [] })),
}));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => sensorFixture.current,
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' },
    update: vi.fn(),
    reload: vi.fn(),
  }),
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'cooling.title': 'Cooling',
      'cooling.preset.off': 'Off',
      'cooling.preset.silent': 'Silent',
      'cooling.preset.balanced': 'Balanced',
      "cooling.preset.turbo": 'Performance',
      'cooling.preset.custom': 'Custom',
      'cooling.label.cpu': 'CPU',
      'cooling.label.gpu': 'GPU',
      'cooling.label.fan': 'FAN',
    }[key] ?? key),
  }),
}));

vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

function coolingWidget(size: PanelWidget['size']): PanelWidget {
  return {
    id: `cooling-${size}`,
    type: 'cooling',
    size,
    col: 0,
    row: 0,
  };
}

describe('CoolingWidget', () => {
  beforeEach(() => {
    sensorFixture.current = sensorFixture.build();
  });

  it('renders 2x2 MicroBars with CPU/GPU temps and FAN duty %, no preset buttons', async () => {
    render(<CoolingWidget widget={coolingWidget('2x2')} />);

    expect(screen.queryByRole('button', { name: 'Apply Silent cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Balanced cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Turbo cooling profile' })).not.toBeInTheDocument();

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('GPU')).toBeInTheDocument();
    expect(screen.getByText('FAN')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.getByText('46')).toBeInTheDocument();

    // FAN reads duty % once fan channels load (mock: avg of 40 + 60 = 50).
    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  it('renders 4x2 with response chart fan readout + Silent/Balanced/Turbo buttons', async () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    expect(screen.getByRole('button', { name: 'Apply Silent cooling profile' })).toHaveTextContent('Silent');
    expect(screen.getByRole('button', { name: 'Apply Balanced cooling profile' })).toHaveTextContent('Balanced');
    expect(screen.getByRole('button', { name: 'Apply Turbo cooling profile' })).toHaveTextContent('Performance');

    // Off + Custom dropped from the widget surface.
    expect(screen.queryByRole('button', { name: 'Apply Off cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Custom cooling profile' })).not.toBeInTheDocument();

    // BIOS-driven (no curves bound, fans in Auto): chart falls back to a
    // synthetic curve and pins CPU/GPU notches onto it so the temps are
    // always visible. data-synthetic='true' is the regression guard: if the
    // real curve ever rendered as a flat zero-line we'd lose the fallback.
    await waitFor(() => {
      expect(screen.getByText('CPU')).toBeInTheDocument();
    });
    expect(screen.getByText('GPU')).toBeInTheDocument();
    expect(document.querySelector('[data-synthetic="true"]')).toBeInTheDocument();

    // Avg duty readout in the chart's top-right corner (40 + 60) / 2 = 50%.
    await waitFor(() => {
      expect(screen.getByLabelText('Average fan duty')).toHaveTextContent('50%');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply Balanced cooling profile' }).getAttribute('data-active')).toBe('true');
    });
  });

  it('hides MicroBar slots whose sensors are absent (2x2)', () => {
    sensorFixture.current = {
      ...sensorFixture.build(),
      gpu: [],
      motherboard: [],
    };

    render(<CoolingWidget widget={coolingWidget('2x2')} />);

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.queryByText('GPU')).not.toBeInTheDocument();
    expect(screen.queryByText('FAN')).not.toBeInTheDocument();
  });
});
