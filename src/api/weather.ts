import { fetchService } from './service';

// Per-widget-instance manual override for the weather widget. Absent/null
// keeps the server-side IP geolocation the widget used before this existed.
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

export function geocodeWeatherLocations(query: string, language: string): Promise<WeatherGeocodeResponse | null> {
  const params = new URLSearchParams({ q: query, language });
  return fetchService<WeatherGeocodeResponse>(`/api/weather/geocode?${params.toString()}`);
}
