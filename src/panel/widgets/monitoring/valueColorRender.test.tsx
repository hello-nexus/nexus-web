import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { MonitoringWidget } from './MonitoringWidget';
import { PanelGaugeGradientProvider } from '../common/PanelGaugeGradientContext';

// Without a provider the widgets paint the default gradient, so these prove
// the wiring (toggle -> gradient on the figure, accent tint on the slot), not
// any particular palette.
const mockSensors = vi.hoisted(() => ({
  summary: [],
  cpu: [
    { id: 'cpu-total', name: 'CPU Total', type: 'Load', value: 12, units: '%', formatted: '12%', parent: { id: 'cpu', name: 'CPU' } },
    { id: 'cpu-temp', name: 'CPU Package', type: 'Temperature', value: 95, units: '°C', formatted: '95 °C', parent: { id: 'cpu', name: 'CPU' } },
  ],
  gpu: [],
  memory: [],
  storage: [],
  storageComponents: {},
  storageSensors: [],
  motherboard: [
    { id: 'fan-1', name: 'Fan 1', type: 'Fan', value: 2400, units: 'RPM', formatted: '2400 RPM', parent: { id: 'mobo', name: 'Motherboard' } },
  ],
  motherboardModel: '',
  cpuModel: '',
  gpuModels: [],
  memoryTotal: '',
}));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => mockSensors,
  isSmartStorageComponentId: (id: string) => id.startsWith('smart/'),
}));
vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [] }),
}));
vi.mock('../../../hooks/useFpsSensors', () => ({ useFpsSensors: () => [] }));
vi.mock('../../../hooks/useNetworkMonitor', () => ({
  useNetworkMonitor: () => ({ series: [], sampleCount: 60, totalRate: 0, totalRateIn: 0, totalRateOut: 0, entries: [] }),
}));
vi.mock('../../../hooks/useUiSettings', () => ({
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

function widgetWith(config: Record<string, unknown>): PanelWidget {
  return {
    id: 'monitoring-grade',
    type: 'monitoring',
    size: '2x2',
    col: 0,
    row: 0,
    config: { slotCount: 1, slot0_device: 'cpu', slot0_design: 'bar', ...config } as PanelWidget['config'],
  };
}

function slot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-monitoring-slot-index]');
  if (!el) throw new Error('no slot rendered');
  return el;
}

function fillBackground(container: HTMLElement): string {
  // GaugeTrack's fill is the only element with an inline background here.
  const fills = Array.from(container.querySelectorAll<HTMLElement>('div[style*="background"]'));
  return fills.map(f => f.style.background).find(b => b.includes('linear-gradient')) ?? '';
}

describe('MonitoringWidget value colouring', () => {
  it('leaves the accent and the fill alone when the toggle is off', () => {
    const { container } = render(<MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Package' })} />);
    expect(slot(container).style.getPropertyValue('--panel-accent')).toBe('');
    expect(fillBackground(container)).toBe('');
  });

  it('paints the panel gradient into the bar and tints a hot CPU red', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Package', slot0_valueColor: true })} />,
    );
    // The default gradient ends at #ef4444 (hue 0) from 90% up; a 95 °C
    // reading on the 0-100 scale sits past it.
    expect(slot(container).style.getPropertyValue('--panel-accent')).toMatch(/^hsl\(0\.0,/);
    expect(fillBackground(container)).toContain('linear-gradient(90deg, rgb(37, 99, 235) 0.00%');
  });

  it('keeps a light CPU load on the cool end', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Total', slot0_valueColor: true })} />,
    );
    // #2563eb is hue 221.2.
    expect(slot(container).style.getPropertyValue('--panel-accent')).toMatch(/^hsl\(221\.2,/);
  });

  it('takes the stops the panel provides', () => {
    const stops = [{ at: 0, color: '#00ff00' }, { at: 1, color: '#00ff00' }];
    const { container } = render(
      <PanelGaugeGradientProvider value={{ stops, mode: 'dark', preview: () => {}, commit: () => {} }}>
        <MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Package', slot0_valueColor: true })} />
      </PanelGaugeGradientProvider>,
    );
    // #00ff00 is hue 120.
    expect(slot(container).style.getPropertyValue('--panel-accent')).toMatch(/^hsl\(120\.0,/);
  });

  it('ignores the toggle on a sensor outside the percent/temperature families', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({
        slot0_device: 'motherboard', slot0_sensor: 'Fan 1', slot0_valueColor: true,
      })} />,
    );
    expect(slot(container).style.getPropertyValue('--panel-accent')).toBe('');
    expect(fillBackground(container)).toBe('');
  });
});
