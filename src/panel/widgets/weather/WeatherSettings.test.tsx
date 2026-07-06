import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WeatherSettings } from './WeatherSettings';

const geocodeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../api/weather', () => ({
  geocodeWeatherLocations: geocodeMock,
}));

vi.mock('../../../lib/i18n', () => {
  const dict: Record<string, string> = {
    'panel.widget.weather.settings.units': 'Units',
    'panel.widget.weather.settings.temperature': 'Temperature',
    'panel.widget.weather.settings.auto': 'Auto',
    'panel.widget.weather.settings.celsius': 'Celsius',
    'panel.widget.weather.settings.fahrenheit': 'Fahrenheit',
    'panel.widget.weather.settings.location': 'Location',
    'panel.widget.weather.settings.autoLocation': 'Detect location automatically',
    'panel.widget.weather.settings.searchLocation': 'Search for a city...',
    'panel.widget.weather.settings.noLocationResults': 'No locations found',
    'panel.widget.weather.settings.clearLocation': 'Clear location',
    'panel.widget.weather.settings.currentLocation': 'Selected location: {location}',
    'panel.widget.weather.settings.display': 'Display',
    'panel.widget.weather.settings.condition': 'Condition',
    'panel.widget.weather.settings.humidityAndWind': 'Humidity and wind',
    'common.loading': 'Loading...',
    'common.desktopOnly': 'Full options available on desktop',
  };
  const t = (key: string, params?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  };
  return { useTranslation: () => ({ t, language: 'en' }) };
});

function weatherWidget(config?: Record<string, unknown>): PanelWidget {
  return { id: 'weather-1', type: 'weather', size: '4x2', col: 0, row: 0, config: config as PanelWidget['config'] };
}

describe('WeatherSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    geocodeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the location picker while auto-detect is on', () => {
    render(<WeatherSettings widget={weatherWidget()} surface="desktop" onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
  });

  it('reveals the search input on a keyboard surface once auto is switched off', async () => {
    render(<WeatherSettings widget={weatherWidget()} surface="desktop" onUpdate={vi.fn()} onResize={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));
    expect(screen.getByPlaceholderText('Search for a city...')).toBeInTheDocument();
  });

  it('debounces the geocode search and lists results, then writes the selected location', async () => {
    geocodeMock.mockResolvedValue({
      results: [
        { name: 'Springfield', admin1: 'Illinois', country: 'United States', countryCode: 'US', latitude: 39.78, longitude: -89.65 },
      ],
    });
    const onUpdate = vi.fn();
    render(<WeatherSettings widget={weatherWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));

    fireEvent.change(screen.getByPlaceholderText('Search for a city...'), { target: { value: 'Spring' } });
    expect(geocodeMock).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(geocodeMock).toHaveBeenCalledWith('Spring', 'en');
    expect(screen.getByText('Springfield, Illinois, United States')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Springfield, Illinois, United States'));
    expect(onUpdate).toHaveBeenCalledWith({
      location: { lat: 39.78, lon: -89.65, label: 'Springfield, US', cc: 'US' },
    });
  });

  it('clears the stored location and reverts to auto-detect', () => {
    const onUpdate = vi.fn();
    render(
      <WeatherSettings
        widget={weatherWidget({ location: { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' } })}
        surface="desktop"
        onUpdate={onUpdate}
        onResize={vi.fn()}
      />,
    );
    expect(screen.getByText('Selected location: Berlin, DE')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear location'));
    expect(onUpdate).toHaveBeenCalledWith({ location: null });
  });

  it('hides the search input on a keyboard-less surface and shows the stored location read only', () => {
    render(
      <WeatherSettings
        widget={weatherWidget({ location: { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' } })}
        surface="y70"
        onUpdate={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
    expect(screen.getByText('Selected location: Berlin, DE')).toBeInTheDocument();
  });

  it('shows a desktop-only hint on a keyboard-less surface with no location chosen yet', () => {
    render(<WeatherSettings widget={weatherWidget()} surface="y70" onUpdate={vi.fn()} onResize={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
    expect(screen.getByText('Full options available on desktop')).toBeInTheDocument();
  });
});
