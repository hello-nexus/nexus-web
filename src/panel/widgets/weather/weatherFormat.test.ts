import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import {
  aqiLevelKey,
  compassKey,
  currentHourIndex,
  formatClock,
  formatDistance,
  formatPrecip,
  formatSpeed,
  localHourMinute,
  locationClock,
  resolveUnit,
  upcomingHours,
  uvLevelKey,
} from './weatherFormat';

function snapWithHours(localTime: string, times: string[]): WeatherSnapshot {
  return {
    temperatureC: 20, temperatureF: 68, weatherCode: 0, condition: 'Clear', humidityPct: 50, windKph: 5,
    locationLabel: 'X', asOf: '', localTime, utcOffsetSeconds: 3600,
    hourly: times.map(time => ({ time, weatherCode: 0, temperatureC: 20, temperatureF: 68 })),
  };
}

describe('weatherFormat', () => {
  it('resolves the unit from the setting, then the country', () => {
    expect(resolveUnit('F', 'DE')).toBe('F');
    expect(resolveUnit('C', 'US')).toBe('C');
    expect(resolveUnit(undefined, 'us')).toBe('F');
    expect(resolveUnit('auto', 'IT')).toBe('C');
    expect(resolveUnit(undefined, undefined)).toBe('C');
  });

  it('starts the upcoming hours at the row covering the provider local time', () => {
    const snap = snapWithHours('2026-09-12T19:30', ['2026-09-12T18:00', '2026-09-12T19:00', '2026-09-12T20:00', '2026-09-12T21:00']);
    expect(currentHourIndex(snap)).toBe(1);
    expect(upcomingHours(snap, 2).map(h => h.time)).toEqual(['2026-09-12T19:00', '2026-09-12T20:00']);
  });

  it('falls back to the first row without a provider local time', () => {
    const snap = snapWithHours('', ['2026-09-12T18:00', '2026-09-12T19:00']);
    expect(currentHourIndex(snap)).toBe(0);
    expect(currentHourIndex(null)).toBe(0);
  });

  it('reads wall-clock parts from a provider-local time string', () => {
    expect(localHourMinute('2026-09-12T06:39')).toEqual({ hour: 6, minute: 39 });
    expect(localHourMinute('')).toBeNull();
    expect(localHourMinute(undefined)).toBeNull();
  });

  it('shifts the wall clock by the location offset', () => {
    // 2026-09-12T17:00Z + 1h.
    const snap = snapWithHours('2026-09-12T18:00', []);
    expect(locationClock(snap, Date.UTC(2026, 8, 12, 17, 5))).toEqual({ hour: 18, minute: 5 });
    expect(locationClock({ ...snap, utcOffsetSeconds: null }, 0)).toBeNull();
  });

  it('formats a clock in 12h and 24h', () => {
    expect(formatClock(6, 5, false, 'AM', 'PM')).toBe('06:05');
    expect(formatClock(0, 30, true, 'AM', 'PM')).toBe('12:30 AM');
    expect(formatClock(19, 22, true, 'AM', 'PM')).toBe('7:22 PM');
  });

  it('maps degrees to compass keys', () => {
    expect(compassKey(0)).toBe('panel.widget.weather.compass.n');
    expect(compassKey(44)).toBe('panel.widget.weather.compass.ne');
    expect(compassKey(359)).toBe('panel.widget.weather.compass.n');
    expect(compassKey(225)).toBe('panel.widget.weather.compass.sw');
    expect(compassKey(null)).toBeNull();
  });

  it('bands UV and AQI', () => {
    expect(uvLevelKey(0)).toBe('panel.widget.weather.uv.low');
    expect(uvLevelKey(6)).toBe('panel.widget.weather.uv.high');
    expect(uvLevelKey(11)).toBe('panel.widget.weather.uv.extreme');
    expect(aqiLevelKey(40)).toBe('panel.widget.weather.aqi.good');
    expect(aqiLevelKey(150)).toBe('panel.widget.weather.aqi.sensitive');
    expect(aqiLevelKey(301)).toBe('panel.widget.weather.aqi.hazardous');
  });

  it('follows the temperature unit for speed, distance and precipitation', () => {
    expect(formatSpeed(16.1, 'F')).toEqual({ value: '10', unitKey: 'panel.widget.weather.unit.mph' });
    expect(formatSpeed(16.1, 'C')).toEqual({ value: '16', unitKey: 'panel.widget.weather.unit.kmh' });
    expect(formatDistance(13480, 'C')).toEqual({ value: '13', unitKey: 'panel.widget.weather.unit.km' });
    expect(formatDistance(1609.344, 'F')).toEqual({ value: '1.0', unitKey: 'panel.widget.weather.unit.mi' });
    expect(formatPrecip(2.54, 'F')).toEqual({ value: '0.10', unitKey: 'panel.widget.weather.unit.in' });
    expect(formatPrecip(12.4, 'C')).toEqual({ value: '12', unitKey: 'panel.widget.weather.unit.mm' });
    expect(formatPrecip(null, 'C')).toBeNull();
  });
});
