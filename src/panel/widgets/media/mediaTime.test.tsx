import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { formatTrackTime, useLivePositionMs } from './mediaTime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('formatTrackTime', () => {
  it('formats sub-hour times as m:ss', () => {
    expect(formatTrackTime(0)).toBe('0:00');
    expect(formatTrackTime(20_000)).toBe('0:20');
    expect(formatTrackTime(100_000)).toBe('1:40');
    expect(formatTrackTime(599_999)).toBe('9:59');
    expect(formatTrackTime(600_000)).toBe('10:00');
  });

  it('formats hour-plus times as h:mm:ss', () => {
    expect(formatTrackTime(3_600_000)).toBe('1:00:00');
    expect(formatTrackTime(3_661_000)).toBe('1:01:01');
  });

  it('clamps negatives to zero', () => {
    expect(formatTrackTime(-5_000)).toBe('0:00');
  });
});

// The interval and the anchor share one clock, so both must be faked together.
function useTickClock() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
}

type Props = { pos: number; dur: number; playing: boolean };
const run = (initial: Props) =>
  renderHook((p: Props) => useLivePositionMs(p.pos, p.dur, p.playing), { initialProps: initial });

describe('useLivePositionMs', () => {
  it('ticks forward while playing', () => {
    useTickClock();
    const { result } = run({ pos: 20_000, dur: 100_000, playing: true });
    expect(result.current).toBe(20_000);
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(23_000);
  });

  it('holds the served position while paused', () => {
    useTickClock();
    const { result } = run({ pos: 20_000, dur: 100_000, playing: false });
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(20_000);
  });

  it('re-anchors when a poll delivers a new position', () => {
    useTickClock();
    const { result, rerender } = run({ pos: 20_000, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ pos: 50_000, dur: 100_000, playing: true });
    expect(result.current).toBe(50_000);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(51_000);
  });

  it('re-anchors on a track change even at an identical position', () => {
    useTickClock();
    const { result, rerender } = run({ pos: 0, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ pos: 0, dur: 50_000, playing: true });
    expect(result.current).toBe(0);
  });

  it('does not step backward when a poll lands slightly behind the tick', () => {
    useTickClock();
    const { result, rerender } = run({ pos: 20_000, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(23_000);
    // A poll measured a few hundred ms before the tick must not rewind the second.
    rerender({ pos: 22_800, dur: 100_000, playing: true });
    expect(result.current).toBe(23_000);
  });

  it('clamps to the track duration', () => {
    useTickClock();
    const { result } = run({ pos: 99_000, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(100_000);
  });

  it('does not clamp when the duration is unknown', () => {
    useTickClock();
    const { result } = run({ pos: 10_000, dur: 0, playing: true });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(15_000);
  });

  it('stops ticking once unmounted', () => {
    useTickClock();
    const { result, unmount } = run({ pos: 20_000, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(21_000);
    unmount();
    act(() => vi.advanceTimersByTime(5_000));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops ticking when playback pauses', () => {
    useTickClock();
    const { result, rerender } = run({ pos: 20_000, dur: 100_000, playing: true });
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(22_000);
    rerender({ pos: 22_000, dur: 100_000, playing: false });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(22_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
