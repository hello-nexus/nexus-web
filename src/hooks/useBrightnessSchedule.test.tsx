import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDateKey } from '../lib/brightnessSchedule';
import { useBrightnessSchedule } from './useBrightnessSchedule';

const api = vi.hoisted(() => ({
  fetchBrightnessSchedule: vi.fn(),
  setBrightnessSchedule: vi.fn(),
}));
vi.mock('../api/lighting', () => api);
const topic = vi.hoisted(() => ({ fire: () => {} }));
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_t: string, _e: boolean, cb: () => void) => { topic.fire = cb; },
}));

const OSLO = { lat: 59.9, lon: 10.7, label: 'Oslo, NO', cc: 'NO' };
const state = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
  defaults: [],
  sunShift: true,
  location: null,
  sun: { status: 'ok', date: localDateKey(), sunriseMin: 420, sunsetMin: 1140, sunPoints: [], resolvedLocation: null, autoLocation: null },
  ...over,
});

describe('useBrightnessSchedule sun writes', () => {
  beforeEach(() => {
    api.fetchBrightnessSchedule.mockReset().mockResolvedValue(state());
    api.setBrightnessSchedule.mockReset();
  });

  it('adopts the POST answer instead of refetching', async () => {
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    api.fetchBrightnessSchedule.mockClear();
    api.setBrightnessSchedule.mockResolvedValue(state({ location: OSLO }));
    await act(async () => { await result.current.saveSun({ location: OSLO }); });
    expect(result.current.location).toEqual(OSLO);
    expect(api.fetchBrightnessSchedule).not.toHaveBeenCalled();
    expect(api.setBrightnessSchedule).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, location: OSLO }));
  });

  it('refetches when the answer is a bare envelope', async () => {
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    api.fetchBrightnessSchedule.mockClear().mockResolvedValue(state({ sunShift: false }));
    api.setBrightnessSchedule.mockResolvedValue({ error: false, msg: '' });
    await act(async () => { await result.current.saveSun({ sunShift: false }); });
    expect(api.fetchBrightnessSchedule).toHaveBeenCalledTimes(1);
    expect(result.current.sunShift).toBe(false);
  });

  it('does not let an older broadcast refetch revert a newer pick', async () => {
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    let late: (v: unknown) => void = () => {};
    api.fetchBrightnessSchedule.mockReset().mockReturnValueOnce(new Promise(r => { late = r; }));
    act(() => { topic.fire(); });
    api.setBrightnessSchedule.mockResolvedValue(state({ location: OSLO }));
    await act(async () => { await result.current.saveSun({ location: OSLO }); });
    await act(async () => { late(state({ location: null })); await Promise.resolve(); });
    expect(result.current.location).toEqual(OSLO);
  });

  it('drops a refetch that lands while a write is still in flight', async () => {
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    let answer: (v: unknown) => void = () => {};
    api.setBrightnessSchedule.mockReturnValue(new Promise(r => { answer = r; }));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.saveSun({ location: OSLO }); });
    api.fetchBrightnessSchedule.mockResolvedValue(state({ location: null }));
    await act(async () => { topic.fire(); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.location).toEqual(OSLO);
    await act(async () => { answer(state({ location: OSLO })); await done; });
    expect(result.current.location).toEqual(OSLO);
  });

  it('re-levels the curve at once on a night or day drag and adopts the answer', async () => {
    const sun = { status: 'ok', date: localDateKey(), sunriseMin: 420, sunsetMin: 1140, resolvedLocation: null, autoLocation: null,
      sunPoints: [360, 420, 540, 1020, 1140, 1200].map((min, i) => ({ min, brightness: [10, 55, 100, 100, 55, 10][i] })) };
    api.fetchBrightnessSchedule.mockResolvedValue(state({ sun, sunNight: 10, sunDay: 100 }));
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.sunPoints).not.toBeNull());
    let answer: (v: unknown) => void = () => {};
    api.setBrightnessSchedule.mockReturnValue(new Promise(r => { answer = r; }));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.saveSun({ sunNight: 30 }); });
    expect(result.current.sunLevels).toEqual({ night: 30, day: 100 });
    expect(result.current.sunPoints!.map(p => p.brightness)).toEqual([30, 65, 100, 100, 65, 30]);
    expect(api.setBrightnessSchedule).toHaveBeenCalledWith(expect.objectContaining({ sunNight: 30 }));
    const served = { ...sun, sunPoints: sun.sunPoints.map((p, i) => ({ ...p, brightness: [30, 65, 100, 100, 65, 30][i] })) };
    await act(async () => { answer(state({ sun: served, sunNight: 30, sunDay: 100 })); await done; });
    expect(result.current.sunPoints!.map(p => p.brightness)).toEqual([30, 65, 100, 100, 65, 30]);
  });

  it('plays the sun curve only while the shift is on and the sun is ok', async () => {
    const sun = { status: 'ok', date: localDateKey(), sunriseMin: 420, sunsetMin: 1140, resolvedLocation: null, autoLocation: null,
      sunPoints: [{ min: 0, brightness: 25 }, { min: 720, brightness: 25 }] };
    api.fetchBrightnessSchedule.mockResolvedValue(state({ sun }));
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.sunPoints).toEqual([{ hour: 0, brightness: 25 }, { hour: 12, brightness: 25 }]));
    expect(result.current.current).toBe(25);
  });

  it('keeps the newest of two overlapping writes when the newer answers first', async () => {
    const { result } = renderHook(() => useBrightnessSchedule(true));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    const answers: ((v: unknown) => void)[] = [];
    api.setBrightnessSchedule.mockImplementation(() => new Promise(r => { answers.push(r); }));
    const SINGAPORE = { lat: 1.3, lon: 103.8, label: 'Singapore, SG', cc: 'SG' };
    let w1: Promise<void> = Promise.resolve();
    let w2: Promise<void> = Promise.resolve();
    act(() => { w1 = result.current.saveSun({ location: OSLO }); });
    act(() => { w2 = result.current.saveSun({ location: SINGAPORE }); });
    api.fetchBrightnessSchedule.mockResolvedValue(state({ location: SINGAPORE }));
    await act(async () => { answers[1](state({ location: SINGAPORE })); await w2; });
    await act(async () => { answers[0](state({ location: OSLO })); await w1; });
    await waitFor(() => expect(result.current.location).toEqual(SINGAPORE));
  });

  it('stops waiting for a write that never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useBrightnessSchedule(true));
      await waitFor(() => expect(result.current.schedule).not.toBeNull());
      api.setBrightnessSchedule.mockReturnValue(new Promise(() => {}));
      act(() => { void result.current.saveSun({ location: OSLO }); });
      api.fetchBrightnessSchedule.mockClear().mockResolvedValue(state({ location: OSLO }));
      await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve(); });
      await waitFor(() => expect(api.fetchBrightnessSchedule).toHaveBeenCalled());
      await act(async () => { topic.fire(); await Promise.resolve(); });
      expect(result.current.location).toEqual(OSLO);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('on the minute tick', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
    afterEach(() => { vi.useRealTimers(); });

    const tickOneMinute = async (result: { current: { schedule: unknown } }) => {
      await waitFor(() => expect(result.current.schedule).not.toBeNull());
      api.fetchBrightnessSchedule.mockClear();
      await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve(); });
    };

    it('refetches when the sun date is not today', async () => {
      api.fetchBrightnessSchedule.mockResolvedValue(state({ sun: { ...state().sun, date: '2000-01-01' } }));
      const { result } = renderHook(() => useBrightnessSchedule(true));
      await tickOneMinute(result);
      expect(api.fetchBrightnessSchedule).toHaveBeenCalled();
    });

    it('retries while Auto has no location yet', async () => {
      api.fetchBrightnessSchedule.mockResolvedValue(state({ sun: { ...state().sun, status: 'no-location' } }));
      const { result } = renderHook(() => useBrightnessSchedule(true));
      await tickOneMinute(result);
      expect(api.fetchBrightnessSchedule).toHaveBeenCalled();
    });

    it('does not retry the location while the schedule is off', async () => {
      api.fetchBrightnessSchedule.mockResolvedValue(state({ enabled: false, sun: { ...state().sun, status: 'no-location' } }));
      const { result } = renderHook(() => useBrightnessSchedule(true));
      await tickOneMinute(result);
      expect(api.fetchBrightnessSchedule).not.toHaveBeenCalled();
    });

    it('stays quiet when the date is today and the location is known', async () => {
      const { result } = renderHook(() => useBrightnessSchedule(true));
      await tickOneMinute(result);
      expect(api.fetchBrightnessSchedule).not.toHaveBeenCalled();
    });
  });
});
