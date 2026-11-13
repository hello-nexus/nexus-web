import { describe, expect, it } from 'vitest';
import { sensorCardAnchor, sensorYDomain } from './sensorHistoryHelpers';

describe('sensorYDomain', () => {
  it('holds the data and the limits with padding, so an outside limit still draws', () => {
    const line = { id: 'r1', name: 'CPU', color: 'x', points: [{ t: 1000, avg: 50, max: 52 }] };
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
