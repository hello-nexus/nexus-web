import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import { resetWeatherSnapshotCache, useWeatherSnapshot, WEATHER_REFRESH_MS, WEATHER_RETRY_MS } from './useWeatherSnapshot';

const api = vi.hoisted(() => ({ fetchWeather: vi.fn() }));

vi.mock('../../../api/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/weather')>();
  return { ...actual, ...api };
});

function reading(extra: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    temperatureC: 20, temperatureF: 68, weatherCode: 1, condition: '', humidityPct: 50, windKph: 5,
    locationLabel: 'Berlin', asOf: '2026-09-12T12:00:00Z', ...extra,
  };
}

const EMPTY: WeatherSnapshot = {
  temperatureC: null, temperatureF: null, weatherCode: -1, condition: '', humidityPct: null, windKph: null,
  locationLabel: '', asOf: '', hourly: [], daily: [],
};

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useWeatherSnapshot errors', () => {
  beforeEach(() => {
    resetWeatherSnapshotCache();
    api.fetchWeather.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('clears the error and resets the backoff once a fresh reading arrives', async () => {
    api.fetchWeather
      .mockResolvedValueOnce(reading({ error: 'timeout' }))
      .mockResolvedValueOnce(reading({ error: 'timeout' }))
      .mockResolvedValueOnce(reading({ temperatureC: 21 }))
      .mockResolvedValueOnce(reading({ error: 'timeout' }))
      .mockResolvedValue(reading({ temperatureC: 22 }));
    const { result } = renderHook(() => useWeatherSnapshot(null));
    await advance(0);
    expect(result.current.error).toBe('timeout');
    expect(result.current.snap?.temperatureC).toBe(20);
    await advance(WEATHER_RETRY_MS);
    expect(result.current.error).toBe('timeout');
    await advance(WEATHER_RETRY_MS * 2);
    expect(result.current.error).toBeNull();
    expect(result.current.snap?.temperatureC).toBe(21);
    expect(api.fetchWeather).toHaveBeenCalledTimes(3);
    // Run to the next scheduled refresh; it fails.
    await advance(WEATHER_REFRESH_MS - WEATHER_RETRY_MS * 3);
    expect(api.fetchWeather).toHaveBeenCalledTimes(4);
    expect(result.current.error).toBe('timeout');
    // Backoff exponent was reset by the fresh reading, so the retry is one base step away.
    await advance(WEATHER_RETRY_MS - 1);
    expect(api.fetchWeather).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(api.fetchWeather).toHaveBeenCalledTimes(5);
    expect(result.current.error).toBeNull();
  });

  it('keeps the previous reading and sets the error when a refresh comes back empty', async () => {
    api.fetchWeather
      .mockResolvedValueOnce(reading())
      .mockResolvedValue({ ...EMPTY, error: 'unreachable' });
    const { result } = renderHook(() => useWeatherSnapshot(null));
    await advance(0);
    expect(result.current.error).toBeNull();
    await advance(WEATHER_REFRESH_MS);
    expect(result.current.snap?.asOf).toBe('2026-09-12T12:00:00Z');
    expect(result.current.error).toBe('unreachable');
  });

  it('does not share a stale errored reading with other mounts', async () => {
    api.fetchWeather.mockResolvedValue(reading({ error: 'http' }));
    const first = renderHook(() => useWeatherSnapshot(null));
    await advance(0);
    expect(first.result.current.error).toBe('http');
    const second = renderHook(() => useWeatherSnapshot(null));
    // No cache hit: the second mount starts unloaded and fetches itself.
    expect(second.result.current.loaded).toBe(false);
    await advance(0);
    expect(api.fetchWeather).toHaveBeenCalledTimes(2);
  });
});
