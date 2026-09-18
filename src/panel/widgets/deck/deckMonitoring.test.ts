// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DECK_MONITORING_CATEGORIES, deckCategoryUsesExtras, deckCategoryUsesFps,
  monitoringFillFraction, monitoringFixedDomain, monitoringLineDomain, monitoringSensorKey, monitoringTileDomain, resolveMonitoringSensor,
} from './deckMonitoring';
import { DEVICE_OPTION_KEYS } from '../monitoring/sensorPicker';
import { EMPTY_SENSOR_EXTRAS, type SensorExtras } from '../../../hooks/useSensorExtras';
import type { HardwareSensor, SensorState } from '../../../hooks/useSensors';

function sensor(id: string, name: string, type: string, value: number): HardwareSensor {
  return { id, name, type, value, units: '', formatted: String(value), parent: { id: 'p', name: 'P' } };
}

function sensorState(overrides: Partial<SensorState> = {}): SensorState {
  return {
    summary: [], cpu: [], gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {},
    storageSensors: [], motherboard: [],
    motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    ...overrides,
  };
}

describe('DECK_MONITORING_CATEGORIES', () => {
  it('offers every category the monitoring widget picker does, in the same order, bar the service-unresolvable gpu2/igpu', () => {
    expect(DECK_MONITORING_CATEGORIES).toEqual(DEVICE_OPTION_KEYS.filter(k => k !== 'gpu2' && k !== 'igpu'));
  });

  it('never offers the legacy fan category', () => {
    expect(DECK_MONITORING_CATEGORIES).not.toContain('fan');
  });
});

describe('deckCategoryUsesExtras', () => {
  it('covers the extras-topic categories plus network', () => {
    const usesExtras = DECK_MONITORING_CATEGORIES.filter(deckCategoryUsesExtras);
    expect(usesExtras).toEqual(['memoryModule', 'network', 'battery', 'cooler', 'psu', 'embeddedController']);
  });
});

describe('deckCategoryUsesFps', () => {
  it('is true for fps alone', () => {
    expect(DECK_MONITORING_CATEGORIES.filter(deckCategoryUsesFps)).toEqual(['fps']);
  });
});

describe('monitoringSensorKey', () => {
  it('joins category and sensor id', () => {
    expect(monitoringSensorKey('cpu', '/intelcpu/0/load/0')).toBe('cpu::/intelcpu/0/load/0');
  });
  it('falls back to "default" for an unset sensor id', () => {
    expect(monitoringSensorKey('quick', '')).toBe('quick::default');
  });

  // The widget's PerfSlot builds `network::Network Total` for a series summed
  // from per-process rates; a deck key sums NIC throughput under the same
  // name, so the two must not share one buffer.
  it('scopes network away from the monitoring widget PerfSlot key', () => {
    expect(monitoringSensorKey('network', 'Network Total')).toBe('deck-network::Network Total');
    expect(monitoringSensorKey('network', 'Network Total')).not.toBe('network::Network Total');
  });
});

describe('resolveMonitoringSensor', () => {
  it('resolves a concrete id within the category array', () => {
    const sensors = sensorState({
      cpu: [
        { id: 'a', name: 'CPU Total', type: 'Load', value: 12, units: '%', formatted: '12 %', parent: { id: 'cpu', name: 'CPU' } },
        { id: 'b', name: 'CPU Package', type: 'Temperature', value: 55, units: '°C', formatted: '55 °C', parent: { id: 'cpu', name: 'CPU' } },
      ],
    });
    expect(resolveMonitoringSensor(sensors, 'cpu', 'b', [], [], EMPTY_SENSOR_EXTRAS)?.name).toBe('CPU Package');
  });

  it('returns undefined for an empty category array', () => {
    expect(resolveMonitoringSensor(sensorState(), 'gpu', 'x', [], [], EMPTY_SENSOR_EXTRAS)).toBeUndefined();
  });

  it('resolves an extras-topic category out of the passed extras', () => {
    const extras: SensorExtras = {
      ...EMPTY_SENSOR_EXTRAS,
      memoryModules: [{ id: 'dimm0', name: 'DIMM 0', sensors: [sensor('d0', 'Temperature', 'Temperature', 41)] }],
    };
    expect(resolveMonitoringSensor(sensorState(), 'memoryModule', 'd0', [], [], extras)?.value).toBe(41);
  });

  it('resolves the NIC-summed network aggregate by name, the value the picker stores', () => {
    const networkSensors = [sensor('network-total', 'Network Total', 'Rate', 2048)];
    expect(resolveMonitoringSensor(sensorState(), 'network', 'Network Total', [], networkSensors, EMPTY_SENSOR_EXTRAS)?.value)
      .toBe(2048);
  });

  it('resolves an fps sensor by name', () => {
    const fpsSensors = [sensor('fps/current', 'FPS', 'Framerate', 144)];
    expect(resolveMonitoringSensor(sensorState(), 'fps', 'FPS', fpsSensors, [], EMPTY_SENSOR_EXTRAS)?.value).toBe(144);
  });
});

describe('monitoringTileDomain', () => {
  it('uses a fixed 0-100 domain for Load, Temperature, Control, and Level', () => {
    expect(monitoringTileDomain('Load', [10, 20, 30], 25)).toEqual([0, 100]);
    // Temperature stays in Celsius here - display-unit conversion is formatting-only.
    expect(monitoringTileDomain('Temperature', [40, 60], 55)).toEqual([0, 100]);
    expect(monitoringTileDomain('Control', [10, 90], 50)).toEqual([0, 100]);
    expect(monitoringTileDomain('Level', [10, 90], 50)).toEqual([0, 100]);
  });

  it('adapts to the observed min/max of history for every other sensor type', () => {
    expect(monitoringTileDomain('Clock', [3000, 4200, 3800], 4000)).toEqual([3000, 4200]);
    expect(monitoringTileDomain('Data', [10, 20], 50)).toEqual([10, 50]);
  });

  it('returns a degenerate (min === max) domain for a flat or insufficient history, unwidened', () => {
    expect(monitoringTileDomain('Data', [7, 7, 7], 7)).toEqual([7, 7]);
    expect(monitoringTileDomain('Data', [], 7)).toEqual([7, 7]);
  });

  it('ignores non-finite history samples', () => {
    expect(monitoringTileDomain('Data', [Number.NaN, 5, 15], 10)).toEqual([5, 15]);
  });
});

describe('monitoringFillFraction', () => {
  it('divides value by the domain max (min is not subtracted), clamped to [0, 1]', () => {
    expect(monitoringFillFraction(50, [0, 100])).toBe(0.5);
    expect(monitoringFillFraction(150, [0, 100])).toBe(1);
    expect(monitoringFillFraction(-10, [0, 100])).toBe(0);
    // A nonzero-floored adaptive domain still divides by max alone: 30/90, not (30-10)/(90-10).
    expect(monitoringFillFraction(30, [10, 90])).toBeCloseTo(0.3333, 4);
  });

  it('renders a neutral half-fill for a degenerate domain instead of snapping to 0 or 1', () => {
    expect(monitoringFillFraction(7, [7, 7])).toBe(0.5);
    expect(monitoringFillFraction(0, [0, 0])).toBe(0.5);
  });

  it('returns 0 for a zero or infinite domain max on a non-degenerate domain (no divide-by-zero)', () => {
    expect(monitoringFillFraction(5, [-5, 0])).toBe(0);
    expect(monitoringFillFraction(5, [0, Number.POSITIVE_INFINITY])).toBe(0);
  });
});

describe('monitoringLineDomain', () => {
  it('passes a non-degenerate domain through unchanged', () => {
    expect(monitoringLineDomain([10, 90])).toEqual([10, 90]);
  });

  it('widens a degenerate domain by 1 on each side so the line is drawable', () => {
    expect(monitoringLineDomain([7, 7])).toEqual([6, 8]);
    expect(monitoringLineDomain([0, 0])).toEqual([-1, 1]);
  });
});

describe('monitoringFixedDomain', () => {
  it('returns undefined (adaptive fallback) when scale is not fixed', () => {
    expect(monitoringFixedDomain('adaptive', 0, 100)).toBeUndefined();
    expect(monitoringFixedDomain(undefined, 0, 100)).toBeUndefined();
  });

  it('returns [min, max] for a valid fixed range', () => {
    expect(monitoringFixedDomain('fixed', 10, 90)).toEqual([10, 90]);
  });

  it('falls back to undefined for an inverted or degenerate range', () => {
    expect(monitoringFixedDomain('fixed', 90, 10)).toBeUndefined();
    expect(monitoringFixedDomain('fixed', 50, 50)).toBeUndefined();
  });

  it('falls back to undefined when min or max is missing or non-finite', () => {
    expect(monitoringFixedDomain('fixed', undefined, 90)).toBeUndefined();
    expect(monitoringFixedDomain('fixed', 0, undefined)).toBeUndefined();
    expect(monitoringFixedDomain('fixed', 0, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
