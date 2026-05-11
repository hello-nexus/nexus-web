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
      { name: 'Performance' },
    ],
  })),
}));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => sensorFixture.current,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'cooling.title': 'Cooling',
      'cooling.preset.off': 'Off',
      'cooling.preset.silent': 'Silent',
      'cooling.preset.balanced': 'Balanced',
      'cooling.preset.performance': 'Performance',
      'cooling.preset.custom': 'Custom',
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

  it('renders icon-only preset buttons and hides the trend in the 2x2 layout', () => {
    render(<CoolingWidget widget={coolingWidget('2x2')} />);

    const off = screen.getByRole('button', { name: 'Apply Off cooling profile' });
    const silent = screen.getByRole('button', { name: 'Apply Silent cooling profile' });
    const balanced = screen.getByRole('button', { name: 'Apply Balanced cooling profile' });
    const performance = screen.getByRole('button', { name: 'Apply Performance cooling profile' });
    const custom = screen.getByRole('button', { name: 'Apply Custom cooling profile' });

    expect(screen.queryByLabelText('Average temperature compared with average fan speed')).not.toBeInTheDocument();
    expect(screen.queryByText('52 C')).not.toBeInTheDocument();
    expect(screen.queryByText('1,400 RPM')).not.toBeInTheDocument();
    for (const button of [off, silent, balanced, performance, custom]) {
      expect(button).toContainHTML('svg');
    }
    expect(silent).not.toHaveTextContent('Silent');
    expect(balanced).not.toHaveTextContent('Balanced');
    expect(performance).not.toHaveTextContent('Performance');
  });

  it('shows the active mode label and value-only metrics in the 4x2 layout', async () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    expect(screen.getByRole('button', { name: 'Apply Silent cooling profile' })).not.toHaveTextContent('Silent');
    expect(screen.getByRole('button', { name: 'Apply Balanced cooling profile' })).not.toHaveTextContent('Balanced');
    expect(screen.getByRole('button', { name: 'Apply Performance cooling profile' })).not.toHaveTextContent('Performance');

    const trend = screen.getByLabelText('Average temperature compared with average fan speed');
    expect(trend).toBeInTheDocument();

    expect(await screen.findByText('Balanced')).toBeInTheDocument();

    expect(screen.getByText('52 C')).toBeInTheDocument();
    expect(screen.getByText('1,400 RPM')).toBeInTheDocument();

    expect(screen.queryByText('Avg Temp')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Speed')).not.toBeInTheDocument();
    expect(screen.queryByText('0-100 C')).not.toBeInTheDocument();
    expect(screen.queryByText(/0-\d+,\d+ RPM/)).not.toBeInTheDocument();
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
    expect(screen.queryByText('GPU')).not.toBeInTheDocument();
  });

  it('uses --panel-accent for both temp and fan sparklines', () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    const trend = screen.getByLabelText('Average temperature compared with average fan speed');
    const paths = trend.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThan(0);
    for (const path of Array.from(paths)) {
      const stroke = path.getAttribute('stroke');
      const fill = path.getAttribute('fill');
      // Stroke is set; fill is either the accent (filled temp series) or 'none' (dotted fan).
      expect(stroke === 'var(--panel-accent)' || fill === 'var(--panel-accent)').toBe(true);
    }
  });

  it('does not draw fake zero lines for missing sensor series', async () => {
    sensorFixture.current = {
      ...sensorFixture.build(),
      gpu: [],
      motherboard: [],
    };

    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    const trend = screen.getByLabelText('Average temperature compared with average fan speed');
    await waitFor(() => expect(trend.querySelectorAll('svg')).toHaveLength(1));
    expect(screen.queryByText('0 C')).not.toBeInTheDocument();
    expect(screen.getByText('58 C')).toBeInTheDocument();
    expect(trend).toHaveTextContent('--');
  });

  it('keeps the fan value finite when fan sensors appear after startup', async () => {
    sensorFixture.current = {
      ...sensorFixture.build(),
      motherboard: [],
    };

    const { rerender } = render(<CoolingWidget widget={coolingWidget('4x2')} />);
    expect(screen.getByText('--')).toBeInTheDocument();

    sensorFixture.current = sensorFixture.build();
    rerender(<CoolingWidget widget={coolingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByText('1,400 RPM')).toBeInTheDocument());
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
