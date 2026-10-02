import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTimerAlarm, useTimerAlarm, type TimerAlarm } from './timerAlarm';

describe('readTimerAlarm', () => {
  it('defaults a config-less timer to the beeper, on, for 30 seconds', () => {
    expect(readTimerAlarm(undefined)).toEqual({ enabled: true, sound: 'beeper', seconds: 30 });
  });

  it('reads a saved choice and rejects unknown values', () => {
    expect(readTimerAlarm({ alarm: false, alarmSound: 'chime', alarmSeconds: 5 }))
      .toEqual({ enabled: false, sound: 'chime', seconds: 5 });
    expect(readTimerAlarm({ alarmSound: 'gong', alarmSeconds: 7 }))
      .toEqual({ enabled: true, sound: 'beeper', seconds: 30 });
  });
});

describe('useTimerAlarm', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const alarm: TimerAlarm = { enabled: true, sound: 'beeper', seconds: 10 };

  it('loops the sound when the countdown completes and stops it after the chosen seconds', () => {
    const { rerender } = renderHook(({ ringing }) => useTimerAlarm(ringing, alarm), { initialProps: { ringing: false } });
    expect(play).not.toHaveBeenCalled();

    rerender({ ringing: true });
    expect(play).toHaveBeenCalledTimes(1);
    const audio = play.mock.contexts[0] as HTMLAudioElement;
    expect(audio.loop).toBe(true);
    expect(audio.muted).toBe(false);
    expect(audio.src).toContain('beeper');

    vi.advanceTimersByTime(9_999);
    expect(pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('stops ringing on reset', () => {
    const { rerender } = renderHook(({ ringing }) => useTimerAlarm(ringing, alarm), { initialProps: { ringing: true } });
    rerender({ ringing: false });
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the alarm is off', () => {
    const { rerender } = renderHook(
      ({ ringing }) => useTimerAlarm(ringing, { ...alarm, enabled: false }),
      { initialProps: { ringing: false } },
    );
    rerender({ ringing: true });
    expect(play).not.toHaveBeenCalled();
  });

  it('primes the element muted from the start tap, even with the alarm off', () => {
    const { result } = renderHook(() => useTimerAlarm(false, { ...alarm, enabled: false }));
    result.current();
    expect(play).toHaveBeenCalledTimes(1);
    expect((play.mock.contexts[0] as HTMLAudioElement).muted).toBe(true);
  });
});
