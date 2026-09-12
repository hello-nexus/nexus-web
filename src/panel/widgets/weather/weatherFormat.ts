// Pure helpers shared by the weather tile, page and immersive view: unit
// resolution, per-unit accessors and the label keys the infographics use.
import type {
  WeatherDailyForecast,
  WeatherHourlyForecast,
  WeatherSnapshot,
} from '../../../api/weather';

export type WeatherUnit = 'C' | 'F';

// A precipitation chance under this is left off the hourly/daily columns.
export const MIN_PRECIP_PCT = 10;

const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW', 'FM', 'MH']);

export function resolveUnit(setting: string | undefined, countryCode: string | undefined): WeatherUnit {
  if (setting === 'C' || setting === 'F') return setting;
  return countryCode && FAHRENHEIT_COUNTRIES.has(countryCode.toUpperCase()) ? 'F' : 'C';
}

export function formatTemp(value: number | null | undefined, fallback = '--') {
  return value === null || value === undefined ? fallback : `${Math.round(value)}°`;
}

export function currentTemp(snap: WeatherSnapshot | null, unit: WeatherUnit) {
  if (!snap) return null;
  return unit === 'F' ? snap.temperatureF : snap.temperatureC;
}

export function apparentTemp(snap: WeatherSnapshot | null, unit: WeatherUnit) {
  if (!snap) return null;
  return unit === 'F' ? snap.apparentTemperatureF : snap.apparentTemperatureC;
}

export function dewPoint(snap: WeatherSnapshot | null, unit: WeatherUnit) {
  if (!snap) return null;
  return unit === 'F' ? snap.dewPointF : snap.dewPointC;
}

export function hourlyTemp(item: WeatherHourlyForecast, unit: WeatherUnit) {
  return unit === 'F' ? item.temperatureF : item.temperatureC;
}

export function dailyMin(item: WeatherDailyForecast, unit: WeatherUnit) {
  return unit === 'F' ? item.temperatureMinF : item.temperatureMinC;
}

export function dailyMax(item: WeatherDailyForecast, unit: WeatherUnit) {
  return unit === 'F' ? item.temperatureMaxF : item.temperatureMaxC;
}

export const DAY_LABEL_KEYS = [
  'panel.widget.weather.day.sun',
  'panel.widget.weather.day.mon',
  'panel.widget.weather.day.tue',
  'panel.widget.weather.day.wed',
  'panel.widget.weather.day.thu',
  'panel.widget.weather.day.fri',
  'panel.widget.weather.day.sat',
];

// Index of the hourly row covering the snapshot's local reading time; 0 when
// the provider time is absent (older service) or no row matches.
export function currentHourIndex(snap: WeatherSnapshot | null): number {
  const hourly = snap?.hourly ?? [];
  const local = snap?.localTime;
  if (!local || local.length < 13) return 0;
  const prefix = local.slice(0, 13);
  const idx = hourly.findIndex(h => h.time.startsWith(prefix));
  return idx < 0 ? 0 : idx;
}

// Hourly rows from the current hour onward, capped to `count`.
export function upcomingHours(snap: WeatherSnapshot | null, count: number): WeatherHourlyForecast[] {
  const hourly = snap?.hourly ?? [];
  return hourly.slice(currentHourIndex(snap), currentHourIndex(snap) + count);
}

// Wall-clock parts of a provider-local time string ("2026-09-12T19:30").
export function localHourMinute(time: string | undefined): { hour: number; minute: number } | null {
  if (!time || time.length < 16) return null;
  const hour = Number(time.slice(11, 13));
  const minute = Number(time.slice(14, 16));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

export function formatClock(hour: number, minute: number, hour12: boolean, am: string, pm: string): string {
  const mm = String(minute).padStart(2, '0');
  if (!hour12) return `${String(hour).padStart(2, '0')}:${mm}`;
  return `${hour % 12 || 12}:${mm} ${hour >= 12 ? pm : am}`;
}

// Location wall-clock right now, from the snapshot's UTC offset; null when
// the service did not send one.
export function locationClock(snap: WeatherSnapshot | null, nowMs: number): { hour: number; minute: number } | null {
  const offset = snap?.utcOffsetSeconds;
  if (offset === null || offset === undefined) return null;
  const shifted = new Date(nowMs + offset * 1000);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

// Minutes since local midnight for a provider-local time string.
export function minutesOfDay(time: string | undefined): number | null {
  const parts = localHourMinute(time);
  return parts ? parts.hour * 60 + parts.minute : null;
}

const COMPASS_KEYS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export function compassKey(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return null;
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return `panel.widget.weather.compass.${COMPASS_KEYS[idx]}`;
}

export function uvLevelKey(uv: number | null | undefined): string | null {
  if (uv === null || uv === undefined) return null;
  if (uv < 3) return 'panel.widget.weather.uv.low';
  if (uv < 6) return 'panel.widget.weather.uv.moderate';
  if (uv < 8) return 'panel.widget.weather.uv.high';
  if (uv < 11) return 'panel.widget.weather.uv.veryHigh';
  return 'panel.widget.weather.uv.extreme';
}

// US AQI bands (0-500).
export function aqiLevelKey(aqi: number | null | undefined): string | null {
  if (aqi === null || aqi === undefined) return null;
  if (aqi <= 50) return 'panel.widget.weather.aqi.good';
  if (aqi <= 100) return 'panel.widget.weather.aqi.moderate';
  if (aqi <= 150) return 'panel.widget.weather.aqi.sensitive';
  if (aqi <= 200) return 'panel.widget.weather.aqi.unhealthy';
  if (aqi <= 300) return 'panel.widget.weather.aqi.veryUnhealthy';
  return 'panel.widget.weather.aqi.hazardous';
}

export function humidityLevelKey(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined) return null;
  if (pct < 30) return 'panel.widget.weather.humidity.dry';
  if (pct < 60) return 'panel.widget.weather.humidity.comfortable';
  return 'panel.widget.weather.humidity.humid';
}

export function visibilityLevelKey(m: number | null | undefined): string | null {
  if (m === null || m === undefined) return null;
  if (m >= 10000) return 'panel.widget.weather.visibility.clear';
  if (m >= 4000) return 'panel.widget.weather.visibility.moderate';
  if (m >= 1000) return 'panel.widget.weather.visibility.poor';
  return 'panel.widget.weather.visibility.veryPoor';
}

// Speed / distance follow the temperature unit: Fahrenheit surfaces read
// mph and miles, Celsius surfaces km/h and km.
export function formatSpeed(kph: number | null | undefined, unit: WeatherUnit): { value: string; unitKey: string } | null {
  if (kph === null || kph === undefined) return null;
  return unit === 'F'
    ? { value: String(Math.round(kph * 0.621371)), unitKey: 'panel.widget.weather.unit.mph' }
    : { value: String(Math.round(kph)), unitKey: 'panel.widget.weather.unit.kmh' };
}

export function formatDistance(m: number | null | undefined, unit: WeatherUnit): { value: string; unitKey: string } | null {
  if (m === null || m === undefined) return null;
  if (unit === 'F') {
    const mi = m / 1609.344;
    return { value: mi >= 10 ? String(Math.round(mi)) : mi.toFixed(1), unitKey: 'panel.widget.weather.unit.mi' };
  }
  const km = m / 1000;
  return { value: km >= 10 ? String(Math.round(km)) : km.toFixed(1), unitKey: 'panel.widget.weather.unit.km' };
}

export function formatPrecip(mm: number | null | undefined, unit: WeatherUnit): { value: string; unitKey: string } | null {
  if (mm === null || mm === undefined) return null;
  return unit === 'F'
    ? { value: (mm / 25.4).toFixed(2), unitKey: 'panel.widget.weather.unit.in' }
    : { value: mm >= 10 ? String(Math.round(mm)) : mm.toFixed(1), unitKey: 'panel.widget.weather.unit.mm' };
}

// Clamp a value into [0, 1] over [min, max].
export function fraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
