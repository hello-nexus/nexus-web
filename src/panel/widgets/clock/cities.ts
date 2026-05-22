// World-clock catalog. A curated set spanning every major time zone
// band, sized for a single quick-scan row beneath the day/night map.
// Each entry carries the canonical IANA timezone identifier — that's
// what Intl.DateTimeFormat consumes for DST-correct offsets.
//
// Not user-editable. If you want a city that isn't here, add it.

export interface City {
  readonly name: string;
  readonly country: string;
  readonly tz: string;
  readonly lat: number; // degrees, +north
  readonly lon: number; // degrees, +east
}

export const CITIES: City[] = [
  { name: 'Los Angeles', country: 'USA',         tz: 'America/Los_Angeles', lat: 34.05, lon: -118.24 },
  { name: 'New York',    country: 'USA',         tz: 'America/New_York',    lat: 40.71, lon: -74.01 },
  { name: 'São Paulo',   country: 'Brazil',      tz: 'America/Sao_Paulo',   lat: -23.55, lon: -46.63 },
  { name: 'London',      country: 'UK',          tz: 'Europe/London',       lat: 51.51, lon: -0.13 },
  { name: 'Paris',       country: 'France',      tz: 'Europe/Paris',        lat: 48.86, lon: 2.35 },
  { name: 'Dubai',       country: 'UAE',         tz: 'Asia/Dubai',          lat: 25.2,  lon: 55.27 },
  { name: 'Mumbai',      country: 'India',       tz: 'Asia/Kolkata',        lat: 19.08, lon: 72.88 },
  { name: 'Shanghai',    country: 'China',       tz: 'Asia/Shanghai',       lat: 31.23, lon: 121.47 },
  { name: 'Tokyo',       country: 'Japan',       tz: 'Asia/Tokyo',          lat: 35.68, lon: 139.69 },
  { name: 'Sydney',      country: 'Australia',   tz: 'Australia/Sydney',    lat: -33.87, lon: 151.21 },
];
