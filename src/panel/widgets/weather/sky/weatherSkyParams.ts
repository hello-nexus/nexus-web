import type { WeatherSnapshot } from '../../../../api/weather';
import { localHourMinute, locationClock, minutesOfDay } from '../weatherFormat';

// Uniform name -> value for weathersky.frag.
export type WeatherSkyParams = Record<string, number>;

interface SkyCondition {
  cloudMin: number;
  cloudMax: number;
  rain: number;
  snow: number;
  fog: number;
  storm: number;
}

function cond(cloudMin: number, cloudMax: number, rain = 0, snow = 0, fog = 0, storm = 0): SkyCondition {
  return { cloudMin, cloudMax, rain, snow, fog, storm };
}

// WMO code -> scene. Groups follow weatherConditionKey; intensities step with
// the code's slight/moderate/heavy variants.
export function skyCondition(code: number): SkyCondition {
  switch (code) {
    case 0: return cond(0, 0.15);
    case 1: return cond(0.1, 0.35);
    case 2: return cond(0.3, 0.65);
    case 3: return cond(0.85, 1);
    case 45: return cond(0.3, 0.8, 0, 0, 0.8);
    case 48: return cond(0.3, 0.8, 0, 0, 0.9);
    case 51: return cond(0.75, 1, 0.2);
    case 53: return cond(0.75, 1, 0.3);
    case 55: return cond(0.75, 1, 0.4);
    case 56: return cond(0.75, 1, 0.25, 0.15);
    case 57: return cond(0.75, 1, 0.35, 0.2);
    case 61: return cond(0.8, 1, 0.45);
    case 63: return cond(0.8, 1, 0.65);
    case 65: return cond(0.85, 1, 0.9);
    case 66: return cond(0.8, 1, 0.5, 0.2);
    case 67: return cond(0.85, 1, 0.8, 0.25);
    case 71: return cond(0.75, 1, 0, 0.35);
    case 73: return cond(0.8, 1, 0, 0.6);
    case 75: return cond(0.85, 1, 0, 0.9);
    case 77: return cond(0.75, 1, 0, 0.3);
    case 80: return cond(0.6, 1, 0.45);
    case 81: return cond(0.7, 1, 0.7);
    case 82: return cond(0.8, 1, 0.95);
    case 85: return cond(0.7, 1, 0, 0.5);
    case 86: return cond(0.8, 1, 0, 0.85);
    case 95: return cond(0.9, 1, 0.75, 0, 0, 0.6);
    case 96:
    case 99: return cond(0.95, 1, 0.85, 0, 0, 0.9);
    default: return cond(0, 1);
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Sun and moon placement from the location's clock and today's sun times.
// Day: sunAlt = sin(pi * progress) and sunX runs 0..1 sunrise to sunset.
// Night: sunAlt goes negative the same way; sunX keeps moving past the right
// edge before midnight and approaches from the left after it, so the twilight
// glow stays where the sun set or will rise. moonX runs 0..1 across the night.
export function skySun(snap: WeatherSnapshot, nowMs: number): { sunAlt: number; sunX: number; moonX: number } {
  const today = snap.daily?.[0];
  const rise = minutesOfDay(today?.sunrise);
  const set = minutesOfDay(today?.sunset);
  const clock = locationClock(snap, nowMs) ?? localHourMinute(snap.localTime);
  if (clock && rise !== null && set !== null && set > rise) {
    const now = clock.hour * 60 + clock.minute;
    if (now >= rise && now <= set) {
      const f = (now - rise) / (set - rise);
      return { sunAlt: Math.sin(Math.PI * f), sunX: f, moonX: 0 };
    }
    const nf = ((now - set + 1440) % 1440) / (1440 - (set - rise));
    return { sunAlt: -Math.sin(Math.PI * nf), sunX: nf < 0.5 ? 1 + nf : nf - 1, moonX: nf };
  }
  // Polar day/night or an older service without sun times.
  const isDay = snap.isDay ?? (clock ? clock.hour >= 7 && clock.hour < 19 : true);
  return isDay ? { sunAlt: 0.7, sunX: 0.5, moonX: 0 } : { sunAlt: -0.7, sunX: 1.5, moonX: 0.5 };
}

const SYNODIC_MONTH_DAYS = 29.530588853;
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

// 0 new, 0.5 full.
export function moonPhase(nowMs: number): number {
  const cycles = (nowMs - REFERENCE_NEW_MOON_MS) / 86_400_000 / SYNODIC_MONTH_DAYS;
  return ((cycles % 1) + 1) % 1;
}

export function weatherSkyParams(snap: WeatherSnapshot, nowMs: number): WeatherSkyParams {
  const c = skyCondition(snap.weatherCode);
  const cover = snap.cloudCoverPct;
  const cloud = cover === null || cover === undefined
    ? (c.cloudMin + c.cloudMax) / 2
    : Math.min(c.cloudMax, Math.max(c.cloudMin, cover / 100));

  // Precipitation in mm/h (snow as water equivalent) only ever raises the
  // code's intensity; a light-rain code with a heavy reading reads heavy.
  const mm = snap.precipitationMm ?? 0;
  const rain = c.rain > 0 ? Math.max(c.rain, clamp01(mm / 8)) : 0;
  const snow = c.snow > 0 ? Math.max(c.snow, clamp01(mm / 4)) : 0;

  const vis = snap.visibilityM;
  const visFog = rain === 0 && snow === 0 && vis !== null && vis !== undefined ? clamp01(1 - vis / 2000) * 0.9 : 0;

  // Direction is where the wind blows FROM, clockwise from north; the view
  // faces north, so a westerly (270) blows toward screen right.
  const strength = clamp01((snap.windKph ?? 0) / 50);
  const dir = snap.windDirectionDeg;
  const toward = dir === null || dir === undefined ? 1 : -Math.sin((dir * Math.PI) / 180);

  const sun = skySun(snap, nowMs);
  return {
    u_sunAlt: sun.sunAlt,
    u_sunX: sun.sunX,
    u_moonX: sun.moonX,
    u_moonPhase: moonPhase(nowMs),
    u_cloud: cloud,
    u_rain: rain,
    u_snow: snow,
    u_fog: Math.max(c.fog, visFog),
    u_storm: c.storm,
    u_wind: strength * toward,
  };
}
