import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import { weatherProblem } from './weatherProblem';

const EMPTY: WeatherSnapshot = {
  temperatureC: null, temperatureF: null, weatherCode: -1, condition: '',
  humidityPct: null, windKph: null, locationLabel: '', asOf: '',
};
const WITH_DATA: WeatherSnapshot = { ...EMPTY, temperatureC: 20, temperatureF: 68, weatherCode: 1, asOf: '2026-09-12T12:00:00Z' };

describe('weatherProblem', () => {
  it('is null until the first fetch settles', () => {
    expect(weatherProblem(null, false)).toBeNull();
  });

  it('is null for a snapshot with data', () => {
    expect(weatherProblem(WITH_DATA, true)).toBeNull();
  });

  it('passes the reason of an empty snapshot through', () => {
    expect(weatherProblem({ ...EMPTY, unavailable: 'service' }, true)).toBe('service');
    expect(weatherProblem({ ...EMPTY, unavailable: 'network' }, true)).toBe('network');
  });

  it('is unknown for an empty snapshot from an older service', () => {
    expect(weatherProblem(EMPTY, true)).toBe('unknown');
    expect(weatherProblem({ ...EMPTY, asOf: 'x' }, true)).toBe('unknown');
  });

  it('is unknown when the service did not answer', () => {
    expect(weatherProblem(null, true)).toBe('unknown');
  });
});
