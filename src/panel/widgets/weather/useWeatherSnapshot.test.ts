import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherSnapshot } from '../../../api/weather';
import { resetWeatherSnapshotCache, useWeatherSnapshot, WEATHER_RETRY_MS } from './useWeatherSnapshot';

const api = vi.hoisted(() => ({ fetchWeather: vi.fn() }));

vi.mock('../../../api/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/weather')>();
  return { ...actual, ...api };
});

const EMPTY: WeatherSnapshot = {
  temperatureC: null, temperatureF: null, weatherCode: -1, condition: '',
  humidityPct: null, windKph: null, locationLabel: '', asOf: '', unavailable: 'network',
};
const GOOD: WeatherSnapshot = { ...EMPTY, temperatureC: 20, temperatureF: 68, weatherCode: 1, asOf: '2026-09-12T12:00:00Z', unavailable: undefined };

describe('useWeatherSnapshot outages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetWeatherSnapshotCache();
    api.fetchWeather.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('retries an outage every minute and replaces it with the first good reading', async () => {
    api.fetchWeather.mockResolvedValueOnce(EMPTY).mockResolvedValue(GOOD);
    const { result } = renderHook(() => useWeatherSnapshot(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.snap).toEqual(EMPTY);
    expect(api.fetchWeather).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(WEATHER_RETRY_MS); });
    expect(api.fetchWeather).toHaveBeenCalledTimes(2);
    expect(result.current.snap).toEqual(GOOD);
  });

  it('does not cache an outage for a later mount', async () => {
    api.fetchWeather.mockResolvedValueOnce(EMPTY).mockResolvedValue(GOOD);
    const first = renderHook(() => useWeatherSnapshot(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    first.unmount();
    const second = renderHook(() => useWeatherSnapshot(null));
    expect(second.result.current.loaded).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(second.result.current.snap).toEqual(GOOD);
  });

  it('keeps a good reading for the full refresh window', async () => {
    api.fetchWeather.mockResolvedValue(GOOD);
    renderHook(() => useWeatherSnapshot(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(WEATHER_RETRY_MS * 3); });
    expect(api.fetchWeather).toHaveBeenCalledTimes(1);
  });
});
