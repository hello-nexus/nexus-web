import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gaugeReadings } from '../../../__tests__/panel/visibleText';
import type { PanelWidget } from '../../types';
import { applyProfile, fetchProfiles } from '../../../api/cooling';
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

const mockUiSettings = vi.hoisted(() => ({
  preferredCpuTempSensorId: '',
  preferredGpuTempSensorId: '',
  widgetAdvancedMode: true,
}));
const mockFlags = vi.hoisted(() => ({ lighting: true, cooling: true, monitoring: true, diagnostics: true }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: mockUiSettings,
    update: vi.fn(),
    reload: vi.fn(),
  }),
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
  useFeatureFlags: () => mockFlags,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'cooling.title': 'Cooling',
      'cooling.mode.off': 'Off',
      'cooling.mode.silent': 'Silent',
      'cooling.mode.balanced': 'Balanced',
      'cooling.mode.turbo': 'Turbo',
      'cooling.mode.max': 'Max',
      'cooling.mode.custom': 'Custom',
      'cooling.label.cpu': 'CPU',
      'cooling.label.gpu': 'GPU',
      'cooling.label.fan': 'FAN',
      'cooling.panel.prev': 'Previous fan profile',
      'cooling.panel.next': 'Next fan profile',
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

    expect(screen.queryByRole('button', { name: 'Silent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Balanced' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turbo' })).not.toBeInTheDocument();

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('GPU')).toBeInTheDocument();
    expect(screen.getByText('FAN')).toBeInTheDocument();
    expect(gaugeReadings()).toContain('58°C');
    expect(gaugeReadings()).toContain('46°C');

    // FAN reads duty % once fan channels load (mock: avg of 40 + 60 = 50).
    await waitFor(() => {
      expect(gaugeReadings()).toContain('50%');
    });
  });

  it('renders 4x2 with response chart fan readout + all five icon preset buttons', async () => {
    render(<CoolingWidget widget={coolingWidget('4x2')} />);

    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Silent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Balanced' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turbo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();

    // Icon-only buttons: the label lives in the aria-label, not as text.
    expect(screen.getByRole('button', { name: 'Silent' })).not.toHaveTextContent('Silent');

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
      expect(screen.getByLabelText('cooling.response.avgFanDuty')).toHaveTextContent('50%');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Balanced' }).getAttribute('data-active')).toBe('true');
    });
  });

  describe('simple mode', () => {
    beforeEach(() => { mockUiSettings.widgetAdvancedMode = false; });
    afterEach(() => { mockUiSettings.widgetAdvancedMode = true; });

    it('2x2 renders arrows only - no label, no MicroBars, no chips', async () => {
      render(<CoolingWidget widget={coolingWidget('2x2')} />);
      await waitFor(() => expect(screen.getByLabelText('Previous fan profile')).toBeInTheDocument());
      expect(screen.getByLabelText('Next fan profile')).toBeInTheDocument();
      // Label is intentionally hidden at 2x2 - fan-bars icon alone carries the state.
      expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
      // No rich-mode surfaces.
      expect(screen.queryByText('CPU')).not.toBeInTheDocument();
      expect(screen.queryByText('GPU')).not.toBeInTheDocument();
      expect(screen.queryByText('FAN')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Silent' })).not.toBeInTheDocument();
    });

    it('4x2 renders arrows + preset label', async () => {
      render(<CoolingWidget widget={coolingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());
      expect(screen.getByLabelText('Previous fan profile')).toBeInTheDocument();
      expect(screen.getByLabelText('Next fan profile')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Silent' })).not.toBeInTheDocument();
    });

    it('spins the fan on preset change but not on initial hydration', async () => {
      render(<CoolingWidget widget={coolingWidget('4x2')} />);
      // Hydration (custom → balanced from fetchProfiles) must not spin.
      await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());
      expect(document.querySelector('[data-spinning="true"]')).not.toBeInTheDocument();

      // balanced → turbo: spin scales with the target level (3 bars).
      fireEvent.click(screen.getByLabelText('Next fan profile'));
      await waitFor(() => {
        expect(document.querySelector('[data-spinning="true"][data-level="3"]')).toBeInTheDocument();
      });
    });

    it('cycles past Turbo into Max, the top rung of the arrow cycle', async () => {
      render(<CoolingWidget widget={coolingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Next fan profile'));
      await waitFor(() => expect(screen.getByText('Turbo')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('Next fan profile'));

      await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
      expect(applyProfile).toHaveBeenLastCalledWith('max');
      // Max renders the tornado rather than a fourth bar, but it still drives
      // the fan spin one rung past Turbo.
      expect(document.querySelector('[data-spinning="true"][data-level="4"]')).toBeInTheDocument();
    });

    it('leaving Max refills the bars from empty rather than snapping to level', async () => {
      render(<CoolingWidget widget={coolingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());

      // balanced -> turbo -> max -> wraps to silent.
      fireEvent.click(screen.getByLabelText('Next fan profile'));
      fireEvent.click(screen.getByLabelText('Next fan profile'));
      await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
      // Max unmounts the bars entirely, which is what breaks the fill.
      expect(document.querySelector('[data-bar-highlight="1"]')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Next fan profile'));
      await waitFor(() => expect(screen.getByText('Silent')).toBeInTheDocument());

      // Mounted empty first, so the transition has somewhere to fill from...
      const bar1 = document.querySelector('[data-bar-highlight="1"]');
      expect(bar1).toHaveStyle({ transform: 'scaleY(0)' });
      // ...then the first bar fills on the following frames.
      await waitFor(() => {
        expect(document.querySelector('[data-bar-highlight="1"]')).toHaveStyle({ transform: 'scaleY(1)' });
      });
    });

    it('per-widget config.advancedMode=true overrides the global default and shows the rich UI', async () => {
      // Even with the global default OFF (simple), an explicit per-widget
      // advancedMode=true override takes precedence - the rich 2x2
      // (MicroBars) renders instead.
      const w = { ...coolingWidget('2x2'), config: { advancedMode: true } };
      render(<CoolingWidget widget={w} />);
      await waitFor(() => expect(screen.getByText('CPU')).toBeInTheDocument());
      expect(screen.getByText('GPU')).toBeInTheDocument();
      expect(screen.queryByLabelText('Previous fan profile')).not.toBeInTheDocument();
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

  describe('cooling feature disabled', () => {
    beforeEach(() => { mockFlags.cooling = false; });
    afterEach(() => { mockFlags.cooling = true; });

    it('renders the disabled shell and fetches nothing', async () => {
      vi.mocked(fetchProfiles).mockClear();
      render(<CoolingWidget widget={coolingWidget('4x2')} />);

      expect(screen.getByText('featureDisabled.widget.cooling')).toBeInTheDocument();
      await new Promise(r => setTimeout(r, 0));
      expect(fetchProfiles).not.toHaveBeenCalled();
    });

    it('calls onSectionNavigate with cooling when the action button is clicked', () => {
      const onSectionNavigate = vi.fn();
      render(<CoolingWidget widget={coolingWidget('4x2')} onSectionNavigate={onSectionNavigate} />);

      fireEvent.click(screen.getByText('featureDisabled.widget.open'));
      expect(onSectionNavigate).toHaveBeenCalledWith('cooling');
    });
  });
});
