// World-clock city catalog. The page lets the user add/remove cities; only the
// ones in their list render on the map and in the list. Each entry's IANA tz id
// drives DST-correct offsets via Intl.DateTimeFormat; lat/lon place the map pin.
// `id` is the stable key persisted in the user's selection (a tz can repeat, so
// it can't be the key). City names are proper nouns - data, not i18n strings.

export interface City {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly tz: string;
  readonly lat: number; // degrees, +north
  readonly lon: number; // degrees, +east
}

export const CITY_CATALOG: readonly City[] = [
  // Pacific / Americas
  { id: 'honolulu',      name: 'Honolulu',       country: 'USA',          tz: 'Pacific/Honolulu',               lat: 21.31,  lon: -157.86 },
  { id: 'anchorage',     name: 'Anchorage',      country: 'USA',          tz: 'America/Anchorage',              lat: 61.22,  lon: -149.90 },
  { id: 'vancouver',     name: 'Vancouver',      country: 'Canada',       tz: 'America/Vancouver',              lat: 49.28,  lon: -123.12 },
  { id: 'los-angeles',   name: 'Los Angeles',    country: 'USA',          tz: 'America/Los_Angeles',            lat: 34.05,  lon: -118.24 },
  { id: 'san-francisco', name: 'San Francisco',  country: 'USA',          tz: 'America/Los_Angeles',            lat: 37.77,  lon: -122.42 },
  { id: 'denver',        name: 'Denver',         country: 'USA',          tz: 'America/Denver',                 lat: 39.74,  lon: -104.99 },
  { id: 'mexico-city',   name: 'Mexico City',    country: 'Mexico',       tz: 'America/Mexico_City',            lat: 19.43,  lon: -99.13 },
  { id: 'chicago',       name: 'Chicago',        country: 'USA',          tz: 'America/Chicago',                lat: 41.88,  lon: -87.63 },
  { id: 'new-york',      name: 'New York',       country: 'USA',          tz: 'America/New_York',               lat: 40.71,  lon: -74.01 },
  { id: 'toronto',       name: 'Toronto',        country: 'Canada',       tz: 'America/Toronto',                lat: 43.65,  lon: -79.38 },
  { id: 'bogota',        name: 'Bogotá',         country: 'Colombia',     tz: 'America/Bogota',                 lat: 4.71,   lon: -74.07 },
  { id: 'lima',          name: 'Lima',           country: 'Peru',         tz: 'America/Lima',                   lat: -12.05, lon: -77.04 },
  { id: 'santiago',      name: 'Santiago',       country: 'Chile',        tz: 'America/Santiago',               lat: -33.45, lon: -70.67 },
  { id: 'sao-paulo',     name: 'São Paulo',      country: 'Brazil',       tz: 'America/Sao_Paulo',              lat: -23.55, lon: -46.63 },
  { id: 'rio',           name: 'Rio de Janeiro', country: 'Brazil',       tz: 'America/Sao_Paulo',              lat: -22.91, lon: -43.17 },
  { id: 'buenos-aires',  name: 'Buenos Aires',   country: 'Argentina',    tz: 'America/Argentina/Buenos_Aires', lat: -34.61, lon: -58.38 },

  // Atlantic / Europe / Africa
  { id: 'reykjavik',     name: 'Reykjavík',      country: 'Iceland',      tz: 'Atlantic/Reykjavik',             lat: 64.15,  lon: -21.94 },
  { id: 'lisbon',        name: 'Lisbon',         country: 'Portugal',     tz: 'Europe/Lisbon',                  lat: 38.72,  lon: -9.14 },
  { id: 'dublin',        name: 'Dublin',         country: 'Ireland',      tz: 'Europe/Dublin',                  lat: 53.35,  lon: -6.26 },
  { id: 'london',        name: 'London',         country: 'UK',           tz: 'Europe/London',                  lat: 51.51,  lon: -0.13 },
  { id: 'madrid',        name: 'Madrid',         country: 'Spain',        tz: 'Europe/Madrid',                  lat: 40.42,  lon: -3.70 },
  { id: 'paris',         name: 'Paris',          country: 'France',       tz: 'Europe/Paris',                   lat: 48.86,  lon: 2.35 },
  { id: 'amsterdam',     name: 'Amsterdam',      country: 'Netherlands',  tz: 'Europe/Amsterdam',               lat: 52.37,  lon: 4.90 },
  { id: 'berlin',        name: 'Berlin',         country: 'Germany',      tz: 'Europe/Berlin',                  lat: 52.52,  lon: 13.40 },
  { id: 'zurich',        name: 'Zurich',         country: 'Switzerland',  tz: 'Europe/Zurich',                  lat: 47.38,  lon: 8.54 },
  { id: 'rome',          name: 'Rome',           country: 'Italy',        tz: 'Europe/Rome',                    lat: 41.90,  lon: 12.50 },
  { id: 'stockholm',     name: 'Stockholm',      country: 'Sweden',       tz: 'Europe/Stockholm',               lat: 59.33,  lon: 18.07 },
  { id: 'warsaw',        name: 'Warsaw',         country: 'Poland',       tz: 'Europe/Warsaw',                  lat: 52.23,  lon: 21.01 },
  { id: 'athens',        name: 'Athens',         country: 'Greece',       tz: 'Europe/Athens',                  lat: 37.98,  lon: 23.73 },
  { id: 'casablanca',    name: 'Casablanca',     country: 'Morocco',      tz: 'Africa/Casablanca',              lat: 33.57,  lon: -7.59 },
  { id: 'lagos',         name: 'Lagos',          country: 'Nigeria',      tz: 'Africa/Lagos',                   lat: 6.52,   lon: 3.38 },
  { id: 'cairo',         name: 'Cairo',          country: 'Egypt',        tz: 'Africa/Cairo',                   lat: 30.04,  lon: 31.24 },
  { id: 'johannesburg',  name: 'Johannesburg',   country: 'South Africa', tz: 'Africa/Johannesburg',            lat: -26.20, lon: 28.05 },
  { id: 'nairobi',       name: 'Nairobi',        country: 'Kenya',        tz: 'Africa/Nairobi',                 lat: -1.29,  lon: 36.82 },
  { id: 'istanbul',      name: 'Istanbul',       country: 'Turkey',       tz: 'Europe/Istanbul',                lat: 41.01,  lon: 28.98 },
  { id: 'moscow',        name: 'Moscow',         country: 'Russia',       tz: 'Europe/Moscow',                  lat: 55.76,  lon: 37.62 },

  // Middle East / Asia
  { id: 'jerusalem',     name: 'Tel Aviv',       country: 'Israel',       tz: 'Asia/Jerusalem',                 lat: 32.08,  lon: 34.78 },
  { id: 'riyadh',        name: 'Riyadh',         country: 'Saudi Arabia', tz: 'Asia/Riyadh',                    lat: 24.71,  lon: 46.68 },
  { id: 'dubai',         name: 'Dubai',          country: 'UAE',          tz: 'Asia/Dubai',                     lat: 25.20,  lon: 55.27 },
  { id: 'tehran',        name: 'Tehran',         country: 'Iran',         tz: 'Asia/Tehran',                    lat: 35.69,  lon: 51.39 },
  { id: 'karachi',       name: 'Karachi',        country: 'Pakistan',     tz: 'Asia/Karachi',                   lat: 24.86,  lon: 67.01 },
  { id: 'mumbai',        name: 'Mumbai',         country: 'India',        tz: 'Asia/Kolkata',                   lat: 19.08,  lon: 72.88 },
  { id: 'delhi',         name: 'Delhi',          country: 'India',        tz: 'Asia/Kolkata',                   lat: 28.61,  lon: 77.21 },
  { id: 'colombo',       name: 'Colombo',        country: 'Sri Lanka',    tz: 'Asia/Colombo',                   lat: 6.93,   lon: 79.86 },
  { id: 'dhaka',         name: 'Dhaka',          country: 'Bangladesh',   tz: 'Asia/Dhaka',                     lat: 23.81,  lon: 90.41 },
  { id: 'bangkok',       name: 'Bangkok',        country: 'Thailand',     tz: 'Asia/Bangkok',                   lat: 13.76,  lon: 100.50 },
  { id: 'jakarta',       name: 'Jakarta',        country: 'Indonesia',    tz: 'Asia/Jakarta',                   lat: -6.21,  lon: 106.85 },
  { id: 'singapore',     name: 'Singapore',      country: 'Singapore',    tz: 'Asia/Singapore',                 lat: 1.35,   lon: 103.82 },
  { id: 'kuala-lumpur',  name: 'Kuala Lumpur',   country: 'Malaysia',     tz: 'Asia/Kuala_Lumpur',              lat: 3.14,   lon: 101.69 },
  { id: 'hong-kong',     name: 'Hong Kong',      country: 'China',        tz: 'Asia/Hong_Kong',                 lat: 22.32,  lon: 114.17 },
  { id: 'beijing',       name: 'Beijing',        country: 'China',        tz: 'Asia/Shanghai',                  lat: 39.90,  lon: 116.41 },
  { id: 'shanghai',      name: 'Shanghai',       country: 'China',        tz: 'Asia/Shanghai',                  lat: 31.23,  lon: 121.47 },
  { id: 'taipei',        name: 'Taipei',         country: 'Taiwan',       tz: 'Asia/Taipei',                    lat: 25.03,  lon: 121.57 },
  { id: 'manila',        name: 'Manila',         country: 'Philippines',  tz: 'Asia/Manila',                    lat: 14.60,  lon: 120.98 },
  { id: 'seoul',         name: 'Seoul',          country: 'South Korea',  tz: 'Asia/Seoul',                     lat: 37.57,  lon: 126.98 },
  { id: 'tokyo',         name: 'Tokyo',          country: 'Japan',        tz: 'Asia/Tokyo',                     lat: 35.68,  lon: 139.69 },
  { id: 'osaka',         name: 'Osaka',          country: 'Japan',        tz: 'Asia/Tokyo',                     lat: 34.69,  lon: 135.50 },

  // Oceania
  { id: 'perth',         name: 'Perth',          country: 'Australia',    tz: 'Australia/Perth',                lat: -31.95, lon: 115.86 },
  { id: 'adelaide',      name: 'Adelaide',       country: 'Australia',    tz: 'Australia/Adelaide',             lat: -34.93, lon: 138.60 },
  { id: 'brisbane',      name: 'Brisbane',       country: 'Australia',    tz: 'Australia/Brisbane',             lat: -27.47, lon: 153.03 },
  { id: 'melbourne',     name: 'Melbourne',      country: 'Australia',    tz: 'Australia/Melbourne',            lat: -37.81, lon: 144.96 },
  { id: 'sydney',        name: 'Sydney',         country: 'Australia',    tz: 'Australia/Sydney',               lat: -33.87, lon: 151.21 },
  { id: 'auckland',      name: 'Auckland',       country: 'New Zealand',  tz: 'Pacific/Auckland',               lat: -36.85, lon: 174.76 },
  { id: 'suva',          name: 'Suva',           country: 'Fiji',         tz: 'Pacific/Fiji',                   lat: -18.14, lon: 178.44 },
];

export const CITY_BY_ID: ReadonlyMap<string, City> = new Map(CITY_CATALOG.map(c => [c.id, c]));

// Extra search terms for countries shown abbreviated, so "united kingdom",
// "britain", "america" etc. match as well as the displayed short form.
const COUNTRY_ALIASES: Record<string, string> = {
  USA: 'united states of america us',
  UK: 'united kingdom great britain england',
  UAE: 'united arab emirates',
};

// Case-insensitive match of a city against a search query, over its name,
// displayed country, and that country's aliases. Empty query matches all.
export function cityMatches(city: City, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const hay = `${city.name} ${city.country} ${COUNTRY_ALIASES[city.country] ?? ''}`.toLowerCase();
  return hay.includes(q);
}

// Seeded list before the user edits it: a spread of majors across the bands.
export const DEFAULT_CITY_IDS: readonly string[] = [
  'los-angeles', 'new-york', 'sao-paulo', 'london', 'paris',
  'dubai', 'mumbai', 'shanghai', 'tokyo', 'sydney',
];
