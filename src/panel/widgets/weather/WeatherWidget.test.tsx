import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WeatherWidget } from './WeatherWidget';
import { resetWeatherSnapshotCache, WEATHER_RETRY_MS } from './useWeatherSnapshot';
import { fetchService } from '../../../api/service';

// Hourly forecast times are relative to Date.now() so the widget's
// stale-hour filter (WeatherWidget's 1-hour lookback) never drops them
// regardless of when the suite runs.
const mockSnapshot = vi.hoisted(() => ({
  build: () => ({
    temperatureC: 22,
    temperatureF: 72,
    weatherCode: 1,
    condition: 'Partly cloudy',
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

const shader = vi.hoisted(() => ({ ready: true, error: null as string | null }));

vi.mock('../../../hooks/useShaderRenderer', () => ({
  useShaderRenderer: () => ({ ready: shader.ready, loading: false, error: shader.error }),
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
    'panel.widget.weather.cond.partlyCloudy': 'Partly cloudy',
    'panel.widget.offline': 'No connection',
    'panel.widget.weather.error.timeout.short': 'Weather service timed out',
    'panel.widget.weather.error.unreachable.short': 'Cannot reach weather service',
    'panel.widget.weather.error.response.short': 'Weather service error',
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

function weatherWidget(size: PanelWidget['size'], config?: PanelWidget['config']): PanelWidget {
  return { id: `weather-${size}`, type: 'weather', size, col: 0, row: 0, config };
}

describe('WeatherWidget', () => {
  beforeEach(() => {
    resetWeatherSnapshotCache();
    shader.ready = true;
    shader.error = null;
  });
  afterEach(() => vi.clearAllMocks());

  it('renders the compact (2x2) layout with live data', async () => {
    render(<WeatherWidget widget={weatherWidget('2x2')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    // The label comes from the weather code, not the server's English string.
    expect(screen.getByText('Partly cloudy')).toBeInTheDocument();
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

  it('colors the daily bars from the absolute temperature scale by default', async () => {
    const { container } = render(<WeatherWidget widget={weatherWidget('4x4')} />);
    await screen.findByText('Today');
    const fills = Array.from(container.querySelectorAll<HTMLElement>('[style*="linear-gradient"]'));
    expect(fills).toHaveLength(2);
    expect(fills[0].style.background).toMatch(/rgb\(\d+, \d+, \d+\)/);
  });

  it('uses the flat accent color for the daily bars when accent bars is on', async () => {
    const { container } = render(<WeatherWidget widget={weatherWidget('4x4', { accentBars: true })} />);
    await screen.findByText('Today');
    expect(container.querySelectorAll('[style*="linear-gradient"]')).toHaveLength(0);
    expect(container.querySelectorAll('[style*="var(--accent-glow)"]')).toHaveLength(2);
  });

  it('keeps the accent bars on the real accent variable over the animated sky', async () => {
    const { container } = render(<WeatherWidget widget={weatherWidget('4x4', { accentBars: true, animatedSky: true })} />);
    await screen.findByText('Today');
    expect(container.querySelectorAll('[style*="var(--accent-glow)"]')).toHaveLength(2);
    expect(container.querySelectorAll('[style*="--panel-accent-glow"]')).toHaveLength(0);
  });

  describe('current temperature dot', () => {
    const dots = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[class*="dailyBarDot"]'));
    function snapshotWith(overrides: Record<string, unknown>) {
      vi.mocked(fetchService).mockImplementation(() => Promise.resolve({ ...mockSnapshot.build(), ...overrides }) as never);
    }
    afterEach(() => {
      vi.mocked(fetchService).mockImplementation(() => Promise.resolve(mockSnapshot.build()) as never);
    });

    it('renders once, on Today, in the temperature-scale mode', async () => {
      const { container } = render(<WeatherWidget widget={weatherWidget('4x4')} />);
      await screen.findByText('Today');
      expect(dots(container)).toHaveLength(1);
    });

    it('is absent in accent mode and without a current temperature', async () => {
      const accent = render(<WeatherWidget widget={weatherWidget('4x4', { accentBars: true })} />);
      await screen.findByText('Today');
      expect(dots(accent.container)).toHaveLength(0);
      accent.unmount();
      resetWeatherSnapshotCache();
      snapshotWith({ temperatureF: null, temperatureC: null });
      const none = render(<WeatherWidget widget={weatherWidget('4x4')} />);
      await screen.findByText('Today');
      expect(dots(none.container)).toHaveLength(0);
    });

    it('clamps to the track when the current temperature is outside the week range', async () => {
      snapshotWith({ temperatureF: 120, temperatureC: 49 });
      const { container } = render(<WeatherWidget widget={weatherWidget('4x4', { unit: 'F' })} />);
      await screen.findByText('Today');
      expect(dots(container)[0].style.left).toBe('100%');
    });

    it('positions from the Celsius reading in a Celsius widget', async () => {
      const { container } = render(<WeatherWidget widget={weatherWidget('4x4', { unit: 'C' })} />);
      await screen.findByText('Today');
      expect(parseFloat(dots(container)[0].style.left)).toBeCloseTo(80, 5);
    });
  });

  it('shows only the glyph and temperature on a 1x1', async () => {
    render(<WeatherWidget widget={weatherWidget('1x1')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(screen.queryByText('Partly cloudy')).toBeNull();
    expect(screen.queryByText('San Francisco')).toBeNull();
  });

  it('draws no sky unless the widget opts in', async () => {
    const { container } = render(<WeatherWidget widget={weatherWidget('4x2')} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it.each(['1x1', '2x2', '2x4', '4x2', '4x4', '2x2round'] as const)('puts the %s tile on the animated sky', async (size) => {
    const { container } = render(<WeatherWidget widget={weatherWidget(size, { animatedSky: true })} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('[data-sky="true"]')).not.toBeNull();
  });

  it('keeps the sky up while a newly picked location loads', async () => {
    const { container, rerender } = render(<WeatherWidget widget={weatherWidget('4x2', { animatedSky: true })} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    const elsewhere = { lat: 48.1, lon: 11.6, label: 'Munich', cc: 'DE' };
    rerender(<WeatherWidget widget={weatherWidget('4x2', { animatedSky: true, location: elsewhere })} />);
    expect(screen.queryByText('72°')).toBeNull();
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBe(canvas);
  });

  it('retries an unreachable feed well before the refresh interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // The service's empty snapshot: upstream unreachable, no cached reading.
      vi.mocked(fetchService).mockResolvedValueOnce({ asOf: '' } as never);
      render(<WeatherWidget widget={weatherWidget('2x2')} />);
      expect(await screen.findByText('Cannot reach weather service')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(WEATHER_RETRY_MS); });
      expect(await screen.findByText('72°')).toBeInTheDocument();
      expect(fetchService).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['timeout', 'Weather service timed out'],
    ['unreachable', 'Cannot reach weather service'],
    ['http', 'Weather service error'],
    ['invalid', 'Weather service error'],
  ])('names the reason on the tile when the snapshot is empty with error %s', async (error, label) => {
    vi.mocked(fetchService).mockResolvedValueOnce({ asOf: '', error } as never);
    render(<WeatherWidget widget={weatherWidget('2x2')} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText('--')).toBeNull();
  });

  it('reads an empty snapshot without an error field (older service) as unreachable', async () => {
    vi.mocked(fetchService).mockResolvedValueOnce({ asOf: '' } as never);
    render(<WeatherWidget widget={weatherWidget('2x2')} />);
    expect(await screen.findByText('Cannot reach weather service')).toBeInTheDocument();
  });

  it('keeps drawing a stale reading that carries an error and retries it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchService).mockResolvedValueOnce({ ...mockSnapshot.build(), error: 'timeout' } as never);
      render(<WeatherWidget widget={weatherWidget('2x2')} />);
      expect(await screen.findByText('72°')).toBeInTheDocument();
      expect(screen.queryByText('Weather service timed out')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(WEATHER_RETRY_MS); });
      expect(fetchService).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps themed text when the sky cannot draw', async () => {
    shader.ready = false;
    shader.error = 'WebGL2 not supported';
    const { container } = render(<WeatherWidget widget={weatherWidget('4x2', { animatedSky: true })} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(container.querySelector('[data-sky="false"]')).not.toBeNull();
  });
});
