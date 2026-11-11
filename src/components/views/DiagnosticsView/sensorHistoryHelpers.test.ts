import { describe, expect, it } from 'vitest';
import type { MetricHistorySeries } from '../../../api/monitoringHistory';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import { resolveSelectedId, sensorCardAnchor, sensorChartThresholds, sensorYDomain, toSensorChartSeries } from './sensorHistoryHelpers';

const rule = (over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id: 'r1', enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: 'CPU Package', type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, ...over,
});

const recorded = (id: string, avg: number): MetricHistorySeries => (
  { id, kind: 'sensorAlert', name: 'CPU Package', points: [{ t: 1000, avg, max: avg + 2 }] }
);

describe('toSensorChartSeries', () => {
  it('keeps Celsius for a Celsius user and converts every point to Fahrenheit otherwise', () => {
    expect(toSensorChartSeries([recorded('r1', 50)], rule(), 'c', 'CPU')!.points).toEqual([{ t: 1000, avg: 50, max: 52 }]);
    expect(toSensorChartSeries([recorded('r1', 50)], rule(), 'f', 'Label')!.points).toEqual([{ t: 1000, avg: 122, max: 125.6 }]);
  });

  it('names the line with the given label, not the service name', () => {
    expect(toSensorChartSeries([recorded('r1', 50)], rule(), 'c', 'Localized')!.name).toBe('Localized');
  });

  it('leaves non-temperature values untouched', () => {
    const fan = rule({ sensor: { ...rule().sensor, type: 'Fan' } });
    expect(toSensorChartSeries([recorded('r1', 1200)], fan, 'f', 'Label')!.points[0].avg).toBe(1200);
  });

  it('returns undefined without data for the rule', () => {
    expect(toSensorChartSeries([recorded('other', 1)], rule(), 'c', 'Label')).toBeUndefined();
    expect(toSensorChartSeries([{ ...recorded('r1', 1), points: [] }], rule(), 'c', 'Label')).toBeUndefined();
  });
});

describe('sensorChartThresholds', () => {
  it('draws only the set limits, in the display unit and the rule tone', () => {
    expect(sensorChartThresholds(rule({ low: 20, high: 80 }), 'c')).toEqual([
      { value: 20, color: 'var(--warn)' }, { value: 80, color: 'var(--warn)' },
    ]);
    expect(sensorChartThresholds(rule({ high: 80, severity: 'act' }), 'f')).toEqual([{ value: 176, color: 'var(--bad)' }]);
    expect(sensorChartThresholds(rule({ high: null }), 'c')).toEqual([]);
  });
});

describe('sensorYDomain', () => {
  it('holds the data and the limits with padding, so an outside limit still draws', () => {
    const line = toSensorChartSeries([recorded('r1', 50)], rule(), 'c', 'CPU');
    const [min, max] = sensorYDomain(line, [{ value: 80 }])!;
    expect(min).toBeLessThan(50);
    expect(max).toBeGreaterThan(80);
  });

  it('is undefined with nothing to plot and still spans a flat line', () => {
    expect(sensorYDomain(undefined, [])).toBeUndefined();
    const [min, max] = sensorYDomain(undefined, [{ value: 40 }])!;
    expect(max).toBeGreaterThan(min);
  });
});

describe('sensorCardAnchor', () => {
  it('prefixes the rule id', () => {
    expect(sensorCardAnchor('r1')).toBe('sensor-card-r1');
  });
});

describe('resolveSelectedId', () => {
  const rules = [rule({ id: 'a' }), rule({ id: 'b' })];
  it('keeps a picked sensor that still exists', () => {
    expect(resolveSelectedId(rules, 'b')).toBe('b');
  });
  it('falls back to the first sensor when nothing is picked or the pick is gone', () => {
    expect(resolveSelectedId(rules, null)).toBe('a');
    expect(resolveSelectedId(rules, 'gone')).toBe('a');
  });
  it('is null with no sensors', () => {
    expect(resolveSelectedId([], 'a')).toBeNull();
  });
});
