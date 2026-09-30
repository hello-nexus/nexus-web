import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '../../../../api/weather';
import { moonPhase, skyCondition, skySun, weatherSkyParams } from './weatherSkyParams';

function snapshot(patch: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    temperatureC: 20,
    temperatureF: 68,
    weatherCode: 0,
    condition: 'Clear',
    humidityPct: 50,
    windKph: 0,
    locationLabel: 'Test',
    asOf: '2026-09-29T12:00:00Z',
    utcOffsetSeconds: 0,
    daily: [{
      date: '2026-09-29', weatherCode: 0,
      temperatureMinC: 10, temperatureMaxC: 20, temperatureMinF: 50, temperatureMaxF: 68,
      sunrise: '2026-09-29T06:00', sunset: '2026-09-29T18:00',
    }],
    ...patch,
  };
}

const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 29, hour, minute);

describe('skyCondition', () => {
  it('maps each WMO group to its precipitation layer', () => {
    expect(skyCondition(61).rain).toBeGreaterThan(0);
    expect(skyCondition(81).rain).toBeGreaterThan(0);
    expect(skyCondition(73).snow).toBeGreaterThan(0);
    expect(skyCondition(86).snow).toBeGreaterThan(0);
    expect(skyCondition(45).fog).toBeGreaterThan(0);
    expect(skyCondition(95).storm).toBeGreaterThan(0);
    expect(skyCondition(99).storm).toBeGreaterThan(skyCondition(95).storm);
    expect(skyCondition(66).snow).toBeGreaterThan(0);
    expect(skyCondition(0).cloudMax).toBeLessThanOrEqual(0.15);
  });

  it('steps intensity with the slight / moderate / heavy variants', () => {
    expect(skyCondition(61).rain).toBeLessThan(skyCondition(63).rain);
    expect(skyCondition(63).rain).toBeLessThan(skyCondition(65).rain);
    expect(skyCondition(71).snow).toBeLessThan(skyCondition(75).snow);
  });
});

describe('weatherSkyParams', () => {
  it('clamps measured cloud cover into the range the condition allows', () => {
    expect(weatherSkyParams(snapshot({ weatherCode: 0, cloudCoverPct: 90 }), at(12)).u_cloud).toBe(0.15);
    expect(weatherSkyParams(snapshot({ weatherCode: 3, cloudCoverPct: 20 }), at(12)).u_cloud).toBe(0.85);
    expect(weatherSkyParams(snapshot({ weatherCode: 2, cloudCoverPct: 50 }), at(12)).u_cloud).toBe(0.5);
  });

  it('lets a heavy precipitation reading raise a light code', () => {
    expect(weatherSkyParams(snapshot({ weatherCode: 61, precipitationMm: 8 }), at(12)).u_rain).toBe(1);
    expect(weatherSkyParams(snapshot({ weatherCode: 61, precipitationMm: 0 }), at(12)).u_rain).toBe(0.45);
    expect(weatherSkyParams(snapshot({ weatherCode: 0, precipitationMm: 8 }), at(12)).u_rain).toBe(0);
  });

  it('reads low visibility as fog only when nothing is falling', () => {
    expect(weatherSkyParams(snapshot({ weatherCode: 0, visibilityM: 500 }), at(12)).u_fog).toBeCloseTo(0.675);
    expect(weatherSkyParams(snapshot({ weatherCode: 63, visibilityM: 500 }), at(12)).u_fog).toBe(0);
    expect(weatherSkyParams(snapshot({ weatherCode: 0, visibilityM: 20000 }), at(12)).u_fog).toBe(0);
  });

  it('turns the direction the wind comes from into a screen direction', () => {
    const westerly = weatherSkyParams(snapshot({ windKph: 50, windDirectionDeg: 270 }), at(12)).u_wind;
    const easterly = weatherSkyParams(snapshot({ windKph: 25, windDirectionDeg: 90 }), at(12)).u_wind;
    const unknown = weatherSkyParams(snapshot({ windKph: 25 }), at(12)).u_wind;
    expect(westerly).toBeCloseTo(1);
    expect(easterly).toBeCloseTo(-0.5);
    expect(unknown).toBeCloseTo(0.5);
  });
});

describe('skySun', () => {
  it('puts the sun overhead at solar noon and on the horizon at sunset', () => {
    const noon = skySun(snapshot(), at(12));
    expect(noon.sunAlt).toBeCloseTo(1);
    expect(noon.sunX).toBeCloseTo(0.5);
    const sunset = skySun(snapshot(), at(18));
    expect(sunset.sunAlt).toBeCloseTo(0);
    expect(sunset.sunX).toBeCloseTo(1);
  });

  it('keeps the sun moving past the right edge after sunset and in from the left before sunrise', () => {
    const dusk = skySun(snapshot(), at(19));
    expect(dusk.sunAlt).toBeLessThan(0);
    expect(dusk.sunX).toBeGreaterThan(1);
    expect(dusk.moonX).toBeCloseTo(1 / 12);
    const dawn = skySun(snapshot(), at(5));
    expect(dawn.sunAlt).toBeLessThan(0);
    expect(dawn.sunX).toBeLessThan(0);
    const midnight = skySun(snapshot(), at(0));
    expect(midnight.sunAlt).toBeCloseTo(-1);
  });

  it('reads the clock at the location, not the viewer', () => {
    // 04:00 UTC is 12:00 at UTC+8.
    expect(skySun(snapshot({ utcOffsetSeconds: 8 * 3600 }), at(4)).sunAlt).toBeCloseTo(1);
  });

  it('falls back to isDay without sun times', () => {
    expect(skySun(snapshot({ daily: [], isDay: false }), at(12)).sunAlt).toBeLessThan(0);
    expect(skySun(snapshot({ daily: [], isDay: true }), at(0)).sunAlt).toBeGreaterThan(0);
  });
});

describe('moonPhase', () => {
  it('matches known full and new moons', () => {
    expect(moonPhase(Date.UTC(2024, 0, 25, 17, 54))).toBeCloseTo(0.5, 1);
    const newMoon = moonPhase(Date.UTC(2024, 1, 9, 22, 59));
    expect(Math.min(newMoon, 1 - newMoon)).toBeLessThan(0.02);
  });
});
