import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WeatherSettings } from './WeatherSettings';
import { resetWeatherPrefsStore } from './useWeatherPrefs';

const geocodeMock = vi.hoisted(() => vi.fn());
const prefsMock = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
}));

vi.mock('../../../api/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/weather')>();
  return {
    ...actual,
    geocodeWeatherLocations: geocodeMock,
    fetchWeatherPrefs: prefsMock.fetch,
    saveWeatherPrefs: prefsMock.save,
  };
});

vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean }[];
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options?.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  ),
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
    'panel.widget.weather.settings.savedLocation': 'Saved location',
    'panel.widget.weather.settings.pickLocation': 'Choose a location',
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
    resetWeatherPrefsStore();
    prefsMock.fetch.mockReset().mockResolvedValue({ unit: 'auto', locations: [] });
    prefsMock.save.mockReset().mockImplementation((patch: Record<string, unknown>) => Promise.resolve({ unit: 'auto', locations: [], ...patch }));
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
    // The pick also lands in the shared saved-location list.
    expect(prefsMock.save).toHaveBeenCalledWith({
      locations: [{ lat: 39.78, lon: -89.65, label: 'Springfield, US', cc: 'US' }],
    });
  });

  it('lists the saved locations in a picker and writes the chosen one', async () => {
    prefsMock.fetch.mockResolvedValue({
      unit: 'auto',
      locations: [
        { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' },
        { lat: 3, lon: 4, label: 'Tokyo, JP', cc: 'JP' },
      ],
    });
    const onUpdate = vi.fn();
    render(<WeatherSettings widget={weatherWidget()} surface="desktop" onUpdate={onUpdate} onResize={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));

    const select = screen.getByRole('combobox', { name: 'Saved location' }) as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['Choose a location', 'Berlin, DE', 'Tokyo, JP']);
    fireEvent.change(select, { target: { value: '3,4' } });
    expect(onUpdate).toHaveBeenCalledWith({ location: { lat: 3, lon: 4, label: 'Tokyo, JP', cc: 'JP' } });
  });

  it('keeps a legacy pick selectable when it is not in the saved list', async () => {
    const onUpdate = vi.fn();
    render(
      <WeatherSettings
        widget={weatherWidget({ location: { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' } })}
        surface="desktop"
        onUpdate={onUpdate}
        onResize={vi.fn()}
      />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const select = screen.getByRole('combobox', { name: 'Saved location' }) as HTMLSelectElement;
    expect(select.value).toBe('1,2');
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['Berlin, DE']);
  });

  it('switching auto back on clears the stored location', () => {
    const onUpdate = vi.fn();
    render(
      <WeatherSettings
        widget={weatherWidget({ location: { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' } })}
        surface="desktop"
        onUpdate={onUpdate}
        onResize={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));
    expect(onUpdate).toHaveBeenCalledWith({ location: null });
  });

  it('hides the search input on a keyboard-less surface but keeps the saved-location picker', () => {
    render(
      <WeatherSettings
        widget={weatherWidget({ location: { lat: 1, lon: 2, label: 'Berlin, DE', cc: 'DE' } })}
        surface="y70"
        onUpdate={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Saved location' })).toBeInTheDocument();
    expect(screen.queryByText('Full options available on desktop')).toBeNull();
  });

  it('shows a desktop-only hint on a keyboard-less surface with no location chosen yet', () => {
    render(<WeatherSettings widget={weatherWidget()} surface="y70" onUpdate={vi.fn()} onResize={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Detect location automatically' }));
    expect(screen.queryByPlaceholderText('Search for a city...')).toBeNull();
    expect(screen.getByText('Full options available on desktop')).toBeInTheDocument();
  });
});
