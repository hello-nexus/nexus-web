import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import { staleReadingClock, weatherErrorKey, weatherErrorShortKey, weatherHasNoData } from './weatherError';

const base = { temperatureC: 1, temperatureF: 34, weatherCode: 0, condition: '', humidityPct: null, windKph: null, locationLabel: 'X' };

describe('weatherError', () => {
  it('maps each reason to its message group', () => {
    expect(weatherErrorKey('timeout')).toBe('panel.widget.weather.error.timeout');
    expect(weatherErrorKey('unreachable')).toBe('panel.widget.weather.error.unreachable');
    expect(weatherErrorKey('http')).toBe('panel.widget.weather.error.response');
    expect(weatherErrorKey('invalid')).toBe('panel.widget.weather.error.response');
    expect(weatherErrorShortKey('http')).toBe('panel.widget.weather.error.response.short');
  });

  it('treats a missing reason as unreachable', () => {
    expect(weatherErrorKey(null)).toBe('panel.widget.weather.error.unreachable');
    expect(weatherErrorKey(undefined)).toBe('panel.widget.weather.error.unreachable');
  });

  it('detects the no-data state', () => {
    const empty: WeatherSnapshot = { ...base, asOf: '' };
    expect(weatherHasNoData(null, false)).toBe(false);
    expect(weatherHasNoData(null, true)).toBe(true);
    expect(weatherHasNoData(empty, true)).toBe(true);
    expect(weatherHasNoData({ ...base, asOf: '2026-09-12T12:00:00Z', error: 'timeout' }, true)).toBe(false);
  });

  it('parses the stale clock and rejects garbage', () => {
    expect(staleReadingClock('not a date')).toBeNull();
    expect(staleReadingClock('')).toBeNull();
    expect(staleReadingClock('2026-09-12T12:00:00Z')).not.toBeNull();
  });
});
