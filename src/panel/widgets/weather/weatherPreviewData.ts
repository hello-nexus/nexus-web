// Static fixture for the Weather widget's Add-a-Widget catalog face. The live
// widget is the SDK app (com.hellonexus.weather); this mock gives its picker
// tile a representative face instead of a blank sandbox load. Content imitates
// an open-meteo snapshot - untranslated by design (see widget-preview-fixtures).

export interface WeatherHourlyForecast {
  time: string;
  weatherCode: number;
  temperatureC: number | null;
  temperatureF: number | null;
}

export interface WeatherDailyForecast {
  date: string;
  weatherCode: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMinF: number | null;
  temperatureMaxF: number | null;
}

export interface WeatherSnapshot {
  temperatureC: number | null;
  temperatureF: number | null;
  weatherCode: number;
  condition: string;
  humidityPct: number | null;
  windKph: number | null;
  locationLabel: string;
  countryCode?: string;
  asOf: string;
  hourly?: WeatherHourlyForecast[];
  daily?: WeatherDailyForecast[];
}

export const WEATHER_PREVIEW: WeatherSnapshot = {
  temperatureC: 22,
  temperatureF: 72,
  weatherCode: 1,
  condition: 'Mostly sunny',
  humidityPct: 54,
  windKph: 11,
  locationLabel: 'San Francisco',
  countryCode: 'US',
  asOf: '2026-06-23T12:00:00',
  hourly: [
    { time: '2026-06-23T12:00', weatherCode: 1, temperatureC: 22, temperatureF: 72 },
    { time: '2026-06-23T13:00', weatherCode: 2, temperatureC: 23, temperatureF: 73 },
    { time: '2026-06-23T14:00', weatherCode: 2, temperatureC: 24, temperatureF: 75 },
    { time: '2026-06-23T15:00', weatherCode: 3, temperatureC: 23, temperatureF: 74 },
    { time: '2026-06-23T16:00', weatherCode: 1, temperatureC: 22, temperatureF: 71 },
    { time: '2026-06-23T17:00', weatherCode: 1, temperatureC: 21, temperatureF: 70 },
  ],
  daily: [
    { date: '2026-06-23', weatherCode: 1, temperatureMinC: 15, temperatureMaxC: 24, temperatureMinF: 59, temperatureMaxF: 75 },
    { date: '2026-06-24', weatherCode: 2, temperatureMinC: 14, temperatureMaxC: 23, temperatureMinF: 57, temperatureMaxF: 73 },
    { date: '2026-06-25', weatherCode: 3, temperatureMinC: 14, temperatureMaxC: 22, temperatureMinF: 57, temperatureMaxF: 72 },
    { date: '2026-06-26', weatherCode: 61, temperatureMinC: 13, temperatureMaxC: 20, temperatureMinF: 55, temperatureMaxF: 68 },
    { date: '2026-06-27', weatherCode: 80, temperatureMinC: 13, temperatureMaxC: 21, temperatureMinF: 55, temperatureMaxF: 70 },
  ],
};
