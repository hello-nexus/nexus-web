import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { MonitoringWidget } from './MonitoringWidget';

// jsdom resolves no custom properties, so useGaugeRamp falls back to the
// variables.scss dark trio - which is what makes the expected hues fixed here.
// These tests prove the wiring (stops -> fraction -> --panel-accent* on the
// slot), not the live token read; that only exists in a real browser.
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
  useDiagnosticsTempThresholds: () => ({ cpuC: 90, gpuC: 85, storageC: 70, ramC: 60 }),
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

function slotAccent(container: HTMLElement): string {
  const slot = container.querySelector<HTMLElement>('[data-monitoring-slot-index]');
  if (!slot) throw new Error('no slot rendered');
  return slot.style.getPropertyValue('--panel-accent');
}

describe('MonitoringWidget value colouring', () => {
  it('leaves the accent alone when the toggle is off', () => {
    const { container } = render(<MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Package' })} />);
    expect(slotAccent(container)).toBe('');
  });

  it('paints a CPU past its 90C limit at the red end', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Package', slot0_valueColor: true })} />,
    );
    // #ef4444 -> hue 0. Every gauge design reads --panel-accent, so this one
    // override is what colours the whole figure.
    expect(slotAccent(container)).toMatch(/^hsl\(0\.0,/);
  });

  it('keeps a light CPU load on the untouched accent hue', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({ slot0_sensor: 'CPU Total', slot0_valueColor: true })} />,
    );
    // 12% sits under the 50% plateau, so the ramp returns the accent verbatim -
    // #2563eb is hue 221.2.
    expect(slotAccent(container)).toMatch(/^hsl\(221\.2,/);
  });

  it('grades the same 95C reading differently under a Fixed range', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({
        slot0_sensor: 'CPU Package', slot0_valueColor: true,
        slot0_scale: 'fixed', slot0_min: 0, slot0_max: 200,
      })} />,
    );
    // 95 of [0, 200] sits just under the 100 midpoint: still on the accent leg.
    expect(slotAccent(container)).not.toMatch(/^hsl\(0\.0,/);
  });

  it('ignores the toggle on a sensor outside the percent/temperature families', () => {
    const { container } = render(
      <MonitoringWidget widget={widgetWith({
        slot0_device: 'motherboard', slot0_sensor: 'Fan 1', slot0_valueColor: true,
      })} />,
    );
    expect(slotAccent(container)).toBe('');
  });
});
