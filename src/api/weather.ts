import { fetchService, putService } from './service';

// Per-widget-instance manual override for the weather widget. Absent/null
// keeps the server-side IP geolocation the widget used before this existed.
// Same field names as a saved location (WeatherPrefs.locations) so a pick
// from the saved list is stored verbatim.
export interface WeatherLocation {
  lat: number;
  lon: number;
  label: string;
  cc: string;
}

export interface WeatherGeocodeResult {
  name: string;
  admin1: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

interface WeatherGeocodeResponse {
  results: WeatherGeocodeResult[];
}

export interface WeatherHourlyForecast {
  time: string;
  weatherCode: number;
  temperatureC: number | null;
  temperatureF: number | null;
  apparentTemperatureC?: number | null;
  apparentTemperatureF?: number | null;
  precipitationProbabilityPct?: number | null;
  precipitationMm?: number | null;
  humidityPct?: number | null;
  windKph?: number | null;
  uvIndex?: number | null;
  visibilityM?: number | null;
  isDay?: boolean | null;
}

export interface WeatherDailyForecast {
  date: string;
  weatherCode: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMinF: number | null;
  temperatureMaxF: number | null;
  apparentMinC?: number | null;
  apparentMaxC?: number | null;
  apparentMinF?: number | null;
  apparentMaxF?: number | null;
  // Local wall-clock ("2026-09-12T06:39"), no offset suffix; empty when unknown.
  sunrise?: string;
  sunset?: string;
  uvIndexMax?: number | null;
  precipitationSumMm?: number | null;
  precipitationProbabilityMaxPct?: number | null;
  windMaxKph?: number | null;
  windDirectionDeg?: number | null;
}

export interface WeatherAirQuality {
  europeanAqi: number | null;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogenDioxide: number | null;
}

// Every optional field is absent on a snapshot from a service build that
// predates it; consumers treat absent and null alike.
export interface WeatherSnapshot {
  temperatureC: number | null;
  temperatureF: number | null;
  apparentTemperatureC?: number | null;
  apparentTemperatureF?: number | null;
  weatherCode: number;
  condition: string;
  isDay?: boolean | null;
  humidityPct: number | null;
  dewPointC?: number | null;
  dewPointF?: number | null;
  windKph: number | null;
  // Direction the wind blows FROM, degrees clockwise from north.
  windDirectionDeg?: number | null;
  windGustKph?: number | null;
  precipitationMm?: number | null;
  cloudCoverPct?: number | null;
  pressureHpa?: number | null;
  uvIndex?: number | null;
  visibilityM?: number | null;
  airQuality?: WeatherAirQuality | null;
  locationLabel: string;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  utcOffsetSeconds?: number | null;
  // Provider-local wall-clock of the current reading, no offset suffix.
  localTime?: string;
  asOf: string;
  hourly?: WeatherHourlyForecast[];
  daily?: WeatherDailyForecast[];
}

export type WeatherUnitPref = 'auto' | 'C' | 'F';

// Workstation-level weather preferences (settings.json Weather): the saved
// location list shared by the page, the immersive view and the widget
// picker, plus the page's unit choice.
export interface WeatherPrefs {
  unit: WeatherUnitPref;
  locations: WeatherLocation[];
}

// Query string for a manual location; empty when auto (server keeps its
// existing IP-geolocation default).
export function weatherLocationQuery(location: WeatherLocation | null | undefined): string {
  if (!location) return '';
  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lon),
    label: location.label,
    cc: location.cc,
  });
  return `?${params.toString()}`;
}

export function fetchWeather(location: WeatherLocation | null | undefined): Promise<WeatherSnapshot | null> {
  return fetchService<WeatherSnapshot>(`/api/weather${weatherLocationQuery(location)}`);
}

export function geocodeWeatherLocations(query: string, language: string): Promise<WeatherGeocodeResponse | null> {
  const params = new URLSearchParams({ q: query, language });
  return fetchService<WeatherGeocodeResponse>(`/api/weather/geocode?${params.toString()}`);
}

export function fetchWeatherPrefs(): Promise<WeatherPrefs | null> {
  return fetchService<WeatherPrefs>('/api/weather/locations');
}

// Partial: an absent field leaves the stored value alone.
export function saveWeatherPrefs(patch: Partial<WeatherPrefs>): Promise<WeatherPrefs | null> {
  return putService<WeatherPrefs>('/api/weather/locations', patch);
}

export function geocodeResultToLocation(result: WeatherGeocodeResult): WeatherLocation {
  return {
    lat: result.latitude,
    lon: result.longitude,
    label: `${result.name}, ${result.countryCode}`,
    cc: result.countryCode,
  };
}

// Identity of a place: its coordinate rounded to 3 decimals (~100 m), the
// service's dedupe key. Used for list membership, React keys and select values.
export function weatherLocationKey(location: WeatherLocation): string {
  return `${Math.round(location.lat * 1000) / 1000},${Math.round(location.lon * 1000) / 1000}`;
}

export function sameWeatherLocation(a: WeatherLocation | null | undefined, b: WeatherLocation | null | undefined): boolean {
  if (!a || !b) return a === b;
  return weatherLocationKey(a) === weatherLocationKey(b);
}
