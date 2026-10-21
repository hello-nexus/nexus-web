import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import { staleReadingStamp, weatherErrorKey, weatherErrorShortKey, weatherHasNoData } from './weatherError';

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

  it('stamps the stale reading in the location time and flags an older day', () => {
    const snap: WeatherSnapshot = { ...base, asOf: '2026-09-12T22:30:00Z', utcOffsetSeconds: 7200 };
    const sameDay = staleReadingStamp(snap, Date.parse('2026-09-13T01:00:00Z'));
    // 22:30Z is 00:30 on the 13th in UTC+2; now (03:00 there) is the same day.
    expect(sameDay).toMatchObject({ hour: 0, minute: 30, today: true });
    const older = staleReadingStamp(snap, Date.parse('2026-09-14T12:00:00Z'));
    expect(older?.today).toBe(false);
  });

  it('rejects an unparseable or empty asOf', () => {
    expect(staleReadingStamp({ ...base, asOf: 'not a date' }, 0)).toBeNull();
    expect(staleReadingStamp({ ...base, asOf: '' }, 0)).toBeNull();
    expect(staleReadingStamp(null, 0)).toBeNull();
  });
});
