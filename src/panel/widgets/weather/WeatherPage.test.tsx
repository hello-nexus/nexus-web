import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherLocation, WeatherSnapshot } from '../../../api/weather';
import { WeatherPage } from './WeatherPage';
import { WeatherTouch } from './WeatherTouch';
import { resetWeatherPrefsStore } from './useWeatherPrefs';
import { resetWeatherSnapshotCache } from './useWeatherSnapshot';
import type { PanelWidget } from '../../types';

const api = vi.hoisted(() => ({
  fetchWeather: vi.fn(),
  fetchWeatherPrefs: vi.fn(),
  saveWeatherPrefs: vi.fn(),
  geocodeWeatherLocations: vi.fn(),
}));

vi.mock('../../../api/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/weather')>();
  return { ...actual, ...api };
});

vi.mock('../../../lib/i18n', () => {
  const dict: Record<string, string> = {
    'panel.widget.weather': 'Weather',
    'panel.widget.weather.myLocation': 'My Location',
    'panel.widget.weather.locations': 'Locations',
    'panel.widget.weather.removeLocation': 'Remove {location}',
    'panel.widget.weather.hiLo': 'H:{hi}° L:{lo}°',
    'panel.widget.weather.feelsLikeValue': 'Feels like {value}',
    'panel.widget.weather.hourly': 'Hourly forecast',
    'panel.widget.weather.daily': '{days}-day forecast',
    'panel.widget.weather.now': 'Now',
    'panel.widget.weather.airQuality': 'Air quality',
    'panel.widget.weather.uvIndex': 'UV index',
    'panel.widget.weather.sunrise': 'Sunrise',
    'panel.widget.weather.sunsetAt': 'Sunset {time}',
    'panel.widget.weather.wind': 'Wind',
    'panel.widget.weather.pressure': 'Pressure',
    'panel.widget.weather.humidity': 'Humidity',
    'panel.widget.weather.visibility': 'Visibility',
    'panel.widget.weather.feelsLike': 'Feels like',
    'panel.widget.weather.precipitation': 'Precipitation',
    'panel.widget.weather.cond.clear': 'Clear',
    'panel.widget.weather.cond.rain': 'Rain',
    'panel.widget.weather.settings.auto': 'Auto',
    'panel.widget.weather.settings.temperature': 'Temperature',
    'panel.widget.weather.settings.searchLocation': 'Search for a city...',
    'datepicker.today': 'Today',
    'common.loading': 'Loading...',
  };
  const t = (key: string, params?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
  return { useTranslation: () => ({ t, language: 'en' }) };
});

const BERLIN: WeatherLocation = { lat: 52.52, lon: 13.41, label: 'Berlin, DE', cc: 'DE' };
const TOKYO: WeatherLocation = { lat: 35.68, lon: 139.69, label: 'Tokyo, JP', cc: 'JP' };

function snapshot(label: string, tempC: number, code = 0): WeatherSnapshot {
  return {
    temperatureC: tempC, temperatureF: tempC * 9 / 5 + 32,
    apparentTemperatureC: tempC - 1, apparentTemperatureF: (tempC - 1) * 9 / 5 + 32,
    weatherCode: code, condition: '', isDay: true,
    humidityPct: 55, dewPointC: 10, dewPointF: 50, windKph: 12, windDirectionDeg: 90, windGustKph: 20,
    precipitationMm: 0, cloudCoverPct: 10, pressureHpa: 1015, uvIndex: 4, visibilityM: 20000,
    airQuality: { europeanAqi: 20, usAqi: 35, pm25: 5, pm10: 8, ozone: 60, nitrogenDioxide: 4 },
    locationLabel: label, countryCode: 'DE', timezone: 'Europe/Berlin', utcOffsetSeconds: 7200,
    localTime: '2026-09-12T14:00', asOf: '2026-09-12T12:00:00Z',
    hourly: [0, 1, 2].map(i => ({
      time: `2026-09-12T${String(14 + i).padStart(2, '0')}:00`, weatherCode: code,
      temperatureC: tempC + i, temperatureF: (tempC + i) * 9 / 5 + 32, precipitationProbabilityPct: 0, isDay: true,
    })),
    daily: [0, 1].map(i => ({
      date: `2026-09-1${2 + i}`, weatherCode: code,
      temperatureMinC: tempC - 5, temperatureMaxC: tempC + 5, temperatureMinF: 0, temperatureMaxF: 0,
      sunrise: `2026-09-1${2 + i}T06:40`, sunset: `2026-09-1${2 + i}T19:20`, uvIndexMax: 5,
      precipitationSumMm: 0, precipitationProbabilityMaxPct: 5,
    })),
  };
}

function routeFetch(query: string) {
  if (query.includes('Berlin')) return Promise.resolve(snapshot('Berlin, DE', 18, 61));
  if (query.includes('Tokyo')) return Promise.resolve(snapshot('Tokyo, JP', 26));
  return Promise.resolve(snapshot('Trieste, IT', 22));
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('WeatherPage', () => {
  beforeEach(() => {
    resetWeatherPrefsStore();
    resetWeatherSnapshotCache();
    api.fetchWeather.mockReset().mockImplementation((loc: WeatherLocation | null) => routeFetch(loc ? loc.label : ''));
    api.fetchWeatherPrefs.mockReset().mockResolvedValue({ unit: 'auto', locations: [BERLIN, TOKYO] });
    api.saveWeatherPrefs.mockReset().mockImplementation((patch: Record<string, unknown>) =>
      Promise.resolve({ unit: 'auto', locations: [BERLIN, TOKYO], ...patch }));
    api.geocodeWeatherLocations.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('lists My Location plus every saved place and shows the auto place first', async () => {
    render(<WeatherPage />);
    await flush();
    const list = screen.getByRole('listbox', { name: 'Locations' });
    const rows = within(list).getAllByRole('option');
    expect(rows.map(r => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(within(rows[0]).getByText('My Location')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Berlin, DE')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Tokyo, JP')).toBeInTheDocument();
    // The detail pane shows the auto place's conditions and the tiles.
    // Once in the auto row's subline, once as the hero label.
    expect(screen.getAllByText('Trieste, IT')).toHaveLength(2);
    expect(screen.getByText('Air quality')).toBeInTheDocument();
    expect(screen.getByText('UV index')).toBeInTheDocument();
    expect(screen.getByText('2-day forecast')).toBeInTheDocument();
  });

  it('switches the detail pane to the clicked place', async () => {
    render(<WeatherPage />);
    await flush();
    const rows = within(screen.getByRole('listbox', { name: 'Locations' })).getAllByRole('option');
    fireEvent.click(rows[2]);
    await flush();
    expect(rows[2]).toHaveAttribute('aria-selected', 'true');
    // Tokyo is Celsius by country; the hero carries its temperature.
    expect(screen.getAllByText('26°').length).toBeGreaterThan(0);
    expect(screen.getByText('Feels like 25°')).toBeInTheDocument();
  });

  it('removes a saved place through the row button and persists the shorter list', async () => {
    render(<WeatherPage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Berlin, DE' }));
    await flush();
    expect(api.saveWeatherPrefs).toHaveBeenCalledWith({ locations: [TOKYO] });
    expect(within(screen.getByRole('listbox', { name: 'Locations' })).getAllByRole('option')).toHaveLength(2);
  });

  it('adds a searched city to the saved list and selects it', async () => {
    vi.useFakeTimers();
    api.geocodeWeatherLocations.mockResolvedValue({
      results: [{ name: 'Paris', admin1: 'Ile-de-France', country: 'France', countryCode: 'FR', latitude: 48.85, longitude: 2.35 }],
    });
    render(<WeatherPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByPlaceholderText('Search for a city...'), { target: { value: 'Par' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(screen.getByText('Paris, Ile-de-France, France'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.saveWeatherPrefs).toHaveBeenCalledWith({
      locations: [BERLIN, TOKYO, { lat: 48.85, lon: 2.35, label: 'Paris, FR', cc: 'FR' }],
    });
    const rows = within(screen.getByRole('listbox', { name: 'Locations' })).getAllByRole('option');
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveAttribute('aria-selected', 'true');
    vi.useRealTimers();
  });

  it('writes the unit choice through the prefs', async () => {
    render(<WeatherPage />);
    await flush();
    fireEvent.click(screen.getByRole('radio', { name: '°F' }));
    await flush();
    expect(api.saveWeatherPrefs).toHaveBeenCalledWith({ unit: 'F' });
  });
});

describe('WeatherTouch', () => {
  beforeEach(() => {
    resetWeatherPrefsStore();
    resetWeatherSnapshotCache();
    api.fetchWeather.mockReset().mockImplementation((loc: WeatherLocation | null) => routeFetch(loc ? loc.label : ''));
    api.fetchWeatherPrefs.mockReset().mockResolvedValue({ unit: 'auto', locations: [BERLIN] });
    api.saveWeatherPrefs.mockReset().mockImplementation((patch: Record<string, unknown>) =>
      Promise.resolve({ unit: 'auto', locations: [BERLIN], ...patch }));
  });

  function widget(config?: Record<string, unknown>): PanelWidget {
    return { id: 'w', type: 'weather', size: '4x4', col: 0, row: 0, config: config as PanelWidget['config'] };
  }

  it('starts on the tile\'s configured place and keeps a pick that is not in the saved list', async () => {
    render(<WeatherTouch widget={widget({ location: TOKYO })} surface="y70" immersiveGrid={{ columns: 4, rows: 12 }} />);
    await flush();
    const rows = within(screen.getByRole('listbox', { name: 'Locations' })).getAllByRole('option');
    expect(rows.map(r => r.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    expect(within(rows[2]).getByText('Tokyo, JP')).toBeInTheDocument();
    // Keyboard-less surface: no search box.
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
  });

  it('switches place locally without touching the widget config', async () => {
    render(<WeatherTouch widget={widget()} surface="phone" immersiveGrid={{ columns: 4, rows: 8 }} />);
    await flush();
    const rows = within(screen.getByRole('listbox', { name: 'Locations' })).getAllByRole('option');
    fireEvent.click(rows[1]);
    await flush();
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(api.saveWeatherPrefs).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Search for a city...')).toBeInTheDocument();
  });
});
