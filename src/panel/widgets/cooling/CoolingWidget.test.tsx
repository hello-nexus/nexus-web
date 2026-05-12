import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { CoolingWidget } from './CoolingWidget';

const sensorFixture = vi.hoisted(() => {
  const build = () => ({
    cpu: [{ id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 58, units: 'C', formatted: '58°C', parent: { id: 'cpu', name: 'CPU' } }],
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

  it('renders 2x2 as micro stats (no preset buttons, no full trend)', () => {
    render(<CoolingWidget widget={coolingWidget('2x2')} />);

    expect(screen.queryByRole('button', { name: 'Apply Silent cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Balanced cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Performance cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Average temperature compared with average fan speed')).not.toBeInTheDocument();

    expect(screen.getByText('52°C')).toBeInTheDocument();
    expect(screen.getByText('1,400 RPM')).toBeInTheDocument();
  });

  it('renders only Silent/Balanced/Performance buttons in 4x2', async () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    expect(screen.getByRole('button', { name: 'Apply Silent cooling profile' })).toHaveTextContent('Silent');
    expect(screen.getByRole('button', { name: 'Apply Balanced cooling profile' })).toHaveTextContent('Balanced');
    expect(screen.getByRole('button', { name: 'Apply Performance cooling profile' })).toHaveTextContent('Performance');

    // Off + Custom dropped from the widget surface in the 3-button redesign.
    expect(screen.queryByRole('button', { name: 'Apply Off cooling profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Custom cooling profile' })).not.toBeInTheDocument();

    const trend = screen.getByLabelText('Average temperature compared with average fan speed');
    expect(trend).toBeInTheDocument();

    // Temp + RPM live at the top centre, no mode label next to them.
    expect(screen.getByText('52°C')).toBeInTheDocument();
    expect(screen.getByText('1,400 RPM')).toBeInTheDocument();

    // Active-mode tag is no longer rendered inside the trend header.
    await waitFor(() => {
      const header = trend.querySelector(':scope > div');
      expect(header).not.toBeNull();
      expect(header!.textContent).not.toContain('Balanced');
    });
  });

  it('marks the active preset button with data-active=true after profiles load', async () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);
    await waitFor(() => {
      const balanced = screen.getByRole('button', { name: 'Apply Balanced cooling profile' });
      expect(balanced.getAttribute('data-active')).toBe('true');
    });
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
    expect(screen.queryByText('0°C')).not.toBeInTheDocument();
    expect(screen.getByText('58°C')).toBeInTheDocument();
    expect(trend).toHaveTextContent('--');
  });
});
