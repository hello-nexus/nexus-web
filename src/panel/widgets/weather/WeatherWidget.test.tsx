import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WeatherWidget } from './WeatherWidget';

// Hourly forecast times are relative to Date.now() so the widget's
// stale-hour filter (WeatherWidget's 1-hour lookback) never drops them
// regardless of when the suite runs.
const mockSnapshot = vi.hoisted(() => ({
  build: () => ({
    temperatureC: 22,
    temperatureF: 72,
    weatherCode: 1,
    condition: 'Mostly sunny',
    humidityPct: 54,
    windKph: 11,
    locationLabel: 'San Francisco',
    countryCode: 'US',
    asOf: new Date().toISOString(),
    hourly: [
      { time: new Date(Date.now() + 60 * 60 * 1000).toISOString(), weatherCode: 2, temperatureC: 23, temperatureF: 74 },
      { time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), weatherCode: 3, temperatureC: 24, temperatureF: 76 },
    ],
    daily: [
      { date: '2026-06-23', weatherCode: 1, temperatureMinC: 15, temperatureMaxC: 24, temperatureMinF: 59, temperatureMaxF: 75 },
      { date: '2026-06-24', weatherCode: 2, temperatureMinC: 14, temperatureMaxC: 23, temperatureMinF: 57, temperatureMaxF: 73 },
    ],
  }),
}));

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn(() => Promise.resolve(mockSnapshot.build())),
}));

vi.mock('../../../lib/i18n', () => {
  const dict: Record<string, string> = {
    'datepicker.today': 'Today',
    'common.loading': 'Loading...',
    'panel.widget.weather.am': 'AM',
    'panel.widget.weather.pm': 'PM',
    'panel.widget.weather.hiLo': 'H:{hi}° L:{lo}°',
    'panel.widget.weather.noForecast': 'No forecast',
  };
  const t = (key: string, params?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  };
  return { useTranslation: () => ({ t }) };
});

function weatherWidget(size: PanelWidget['size']): PanelWidget {
  return { id: `weather-${size}`, type: 'weather', size, col: 0, row: 0 };
}

describe('WeatherWidget', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the compact (2x2) layout with live data', async () => {
    render(<WeatherWidget widget={weatherWidget('2x2')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(screen.getByText('Mostly sunny')).toBeInTheDocument();
    expect(screen.getByText('San Francisco')).toBeInTheDocument();
  });

  it('renders the wide (4x2) layout with the localized hi/lo label', async () => {
    render(<WeatherWidget widget={weatherWidget('4x2')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(screen.getByText('H:75° L:59°')).toBeInTheDocument();
  });

  it('renders the large (4x4) layout with a daily forecast row', async () => {
    render(<WeatherWidget widget={weatherWidget('4x4')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});
