import { describe, expect, it } from 'vitest';
import { formatWeatherHour, weatherConditionKey } from './weatherConditions';

// Every WMO code the service's ConditionFor emits a label for, plus the codes
// that must fall through to the server string.
const CASES: [number, string | null][] = [
  [0, 'clear'],
  [1, 'partlyCloudy'], [2, 'partlyCloudy'],
  [3, 'overcast'],
  [45, 'fog'], [48, 'fog'],
  [51, 'drizzle'], [53, 'drizzle'], [55, 'drizzle'],
  [56, 'freezingDrizzle'], [57, 'freezingDrizzle'],
  [61, 'rain'], [63, 'rain'], [65, 'rain'],
  [66, 'freezingRain'], [67, 'freezingRain'],
  [71, 'snow'], [73, 'snow'], [75, 'snow'],
  [77, 'snowGrains'],
  [80, 'rainShowers'], [81, 'rainShowers'], [82, 'rainShowers'],
  [85, 'snowShowers'], [86, 'snowShowers'],
  [95, 'thunderstorm'],
  [96, 'thunderstormHail'], [99, 'thunderstormHail'],
].map(([code, name]) => [code as number, `panel.widget.weather.cond.${name}`]);

describe('weatherConditionKey', () => {
  it.each(CASES)('maps code %i', (code, key) => {
    expect(weatherConditionKey(code)).toBe(key);
  });

  // -1 is what the service sends when open-meteo omitted the code; a widget
  // that keyed off it would render a raw key instead of the server string.
  it.each([null, undefined, -1, 4, 100])('falls through for %s', (code) => {
    expect(weatherConditionKey(code)).toBeNull();
  });
});

describe('formatWeatherHour', () => {
  const at = (h: number) => new Date(2026, 5, 23, h, 0, 0).toISOString();

  it('renders a zero-padded bare hour in 24-hour mode', () => {
    expect(formatWeatherHour(at(9), false, 'AM', 'PM')).toBe('09');
    expect(formatWeatherHour(at(0), false, 'AM', 'PM')).toBe('00');
    expect(formatWeatherHour(at(13), false, 'AM', 'PM')).toBe('13');
  });

  it('renders the translated suffix in 12-hour mode', () => {
    expect(formatWeatherHour(at(0), true, 'AM', 'PM')).toBe('12AM');
    expect(formatWeatherHour(at(9), true, 'AM', 'PM')).toBe('9AM');
    expect(formatWeatherHour(at(12), true, 'AM', 'PM')).toBe('12PM');
    expect(formatWeatherHour(at(13), true, 'a.', 'p.')).toBe('1p.');
  });

  it('falls back to the wire time when the timestamp will not parse', () => {
    expect(formatWeatherHour('2026-06-23T14:30', true, 'AM', 'PM')).toBe('2PM');
    expect(formatWeatherHour('not-a-date T07:45', true, 'AM', 'PM')).toBe('07:45');
    expect(formatWeatherHour('garbage', true, 'AM', 'PM')).toBe('');
  });
});
