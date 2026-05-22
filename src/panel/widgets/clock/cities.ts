// Static catalog of well-known cities for the world-clock view. The
// list intentionally covers each major time zone band so a user
// scrolling for their hometown finds something nearby. Each entry
// carries the canonical IANA timezone identifier — that's what
// `Intl.DateTimeFormat` consumes for accurate offset rendering across
// DST changes.

export interface City {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly tz: string;
  readonly lat: number; // degrees, +north
  readonly lon: number; // degrees, +east, -180..180
}

export const CITY_CATALOG: City[] = [
  { id: 'honolulu',    name: 'Honolulu',     country: 'USA',         tz: 'Pacific/Honolulu',    lat: 21.3,  lon: -157.8 },
  { id: 'anchorage',   name: 'Anchorage',    country: 'USA',         tz: 'America/Anchorage',   lat: 61.2,  lon: -149.9 },
  { id: 'losangeles',  name: 'Los Angeles',  country: 'USA',         tz: 'America/Los_Angeles', lat: 34.05, lon: -118.24 },
  { id: 'vancouver',   name: 'Vancouver',    country: 'Canada',      tz: 'America/Vancouver',   lat: 49.28, lon: -123.12 },
  { id: 'denver',      name: 'Denver',       country: 'USA',         tz: 'America/Denver',      lat: 39.74, lon: -104.99 },
  { id: 'mexicocity',  name: 'Mexico City',  country: 'Mexico',      tz: 'America/Mexico_City', lat: 19.43, lon: -99.13 },
  { id: 'chicago',     name: 'Chicago',      country: 'USA',         tz: 'America/Chicago',     lat: 41.88, lon: -87.63 },
  { id: 'newyork',     name: 'New York',     country: 'USA',         tz: 'America/New_York',    lat: 40.71, lon: -74.01 },
  { id: 'toronto',     name: 'Toronto',      country: 'Canada',      tz: 'America/Toronto',     lat: 43.65, lon: -79.38 },
  { id: 'saopaulo',    name: 'São Paulo',    country: 'Brazil',      tz: 'America/Sao_Paulo',   lat: -23.55, lon: -46.63 },
  { id: 'buenosaires', name: 'Buenos Aires', country: 'Argentina',   tz: 'America/Argentina/Buenos_Aires', lat: -34.6, lon: -58.38 },
  { id: 'reykjavik',   name: 'Reykjavik',    country: 'Iceland',     tz: 'Atlantic/Reykjavik',  lat: 64.13, lon: -21.82 },
  { id: 'lisbon',      name: 'Lisbon',       country: 'Portugal',    tz: 'Europe/Lisbon',       lat: 38.72, lon: -9.14 },
  { id: 'london',      name: 'London',       country: 'UK',          tz: 'Europe/London',       lat: 51.51, lon: -0.13 },
  { id: 'dublin',      name: 'Dublin',       country: 'Ireland',     tz: 'Europe/Dublin',       lat: 53.35, lon: -6.26 },
  { id: 'paris',       name: 'Paris',        country: 'France',      tz: 'Europe/Paris',        lat: 48.86, lon: 2.35 },
  { id: 'madrid',      name: 'Madrid',       country: 'Spain',       tz: 'Europe/Madrid',       lat: 40.42, lon: -3.7 },
  { id: 'rome',        name: 'Rome',         country: 'Italy',       tz: 'Europe/Rome',         lat: 41.9,  lon: 12.5 },
  { id: 'berlin',      name: 'Berlin',       country: 'Germany',     tz: 'Europe/Berlin',       lat: 52.52, lon: 13.4 },
  { id: 'stockholm',   name: 'Stockholm',    country: 'Sweden',      tz: 'Europe/Stockholm',    lat: 59.33, lon: 18.06 },
  { id: 'cairo',       name: 'Cairo',        country: 'Egypt',       tz: 'Africa/Cairo',        lat: 30.04, lon: 31.24 },
  { id: 'capetown',    name: 'Cape Town',    country: 'South Africa', tz: 'Africa/Johannesburg', lat: -33.92, lon: 18.42 },
  { id: 'lagos',       name: 'Lagos',        country: 'Nigeria',     tz: 'Africa/Lagos',        lat: 6.52,  lon: 3.38 },
  { id: 'istanbul',    name: 'Istanbul',     country: 'Turkey',      tz: 'Europe/Istanbul',     lat: 41.01, lon: 28.98 },
  { id: 'moscow',      name: 'Moscow',       country: 'Russia',      tz: 'Europe/Moscow',       lat: 55.75, lon: 37.62 },
  { id: 'dubai',       name: 'Dubai',        country: 'UAE',         tz: 'Asia/Dubai',          lat: 25.2,  lon: 55.27 },
  { id: 'mumbai',      name: 'Mumbai',       country: 'India',       tz: 'Asia/Kolkata',        lat: 19.08, lon: 72.88 },
  { id: 'newdelhi',    name: 'New Delhi',    country: 'India',       tz: 'Asia/Kolkata',        lat: 28.61, lon: 77.21 },
  { id: 'dhaka',       name: 'Dhaka',        country: 'Bangladesh',  tz: 'Asia/Dhaka',          lat: 23.81, lon: 90.41 },
  { id: 'bangkok',     name: 'Bangkok',      country: 'Thailand',    tz: 'Asia/Bangkok',        lat: 13.76, lon: 100.5 },
  { id: 'jakarta',     name: 'Jakarta',      country: 'Indonesia',   tz: 'Asia/Jakarta',        lat: -6.21, lon: 106.85 },
  { id: 'singapore',   name: 'Singapore',    country: 'Singapore',   tz: 'Asia/Singapore',      lat: 1.35,  lon: 103.82 },
  { id: 'hongkong',    name: 'Hong Kong',    country: 'Hong Kong',   tz: 'Asia/Hong_Kong',      lat: 22.32, lon: 114.17 },
  { id: 'beijing',     name: 'Beijing',      country: 'China',       tz: 'Asia/Shanghai',       lat: 39.9,  lon: 116.4 },
  { id: 'shanghai',    name: 'Shanghai',     country: 'China',       tz: 'Asia/Shanghai',       lat: 31.23, lon: 121.47 },
  { id: 'taipei',      name: 'Taipei',       country: 'Taiwan',      tz: 'Asia/Taipei',         lat: 25.03, lon: 121.57 },
  { id: 'seoul',       name: 'Seoul',        country: 'South Korea', tz: 'Asia/Seoul',          lat: 37.57, lon: 126.98 },
  { id: 'tokyo',       name: 'Tokyo',        country: 'Japan',       tz: 'Asia/Tokyo',          lat: 35.68, lon: 139.69 },
  { id: 'sydney',      name: 'Sydney',       country: 'Australia',   tz: 'Australia/Sydney',    lat: -33.87, lon: 151.21 },
  { id: 'melbourne',   name: 'Melbourne',    country: 'Australia',   tz: 'Australia/Melbourne', lat: -37.81, lon: 144.96 },
  { id: 'auckland',    name: 'Auckland',     country: 'New Zealand', tz: 'Pacific/Auckland',    lat: -36.85, lon: 174.76 },
];

const CITIES_BY_ID = new Map(CITY_CATALOG.map(c => [c.id, c]));

export function getCity(id: string): City | undefined {
  return CITIES_BY_ID.get(id);
}

// Sensible starter set so the world-clock list isn't blank on first
// open. Spread across continents to demonstrate the day/night map.
export const DEFAULT_CITY_IDS: string[] = [
  'losangeles',
  'newyork',
  'london',
  'dubai',
  'tokyo',
  'sydney',
];
