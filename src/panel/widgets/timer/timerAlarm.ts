import { useCallback, useEffect, useRef } from 'react';
import type { PanelConfigValue } from '../../types';
import klaxon from './sounds/klaxon.mp3';
import buzzer from './sounds/buzzer.mp3';
import beeper from './sounds/beeper.mp3';
import arcade from './sounds/arcade.mp3';
import bell from './sounds/bell.mp3';
import pulse from './sounds/pulse.mp3';
import ding from './sounds/ding.mp3';
import chime from './sounds/chime.mp3';
import marimba from './sounds/marimba.mp3';
import crystal from './sounds/crystal.mp3';

// Loudest first: the settings picker lists them in this order. Each file is
// one loop cycle ending in silence, so `loop` needs no gapless decoding.
const SOUND_URLS = { klaxon, buzzer, beeper, arcade, bell, pulse, ding, chime, marimba, crystal };

export type TimerAlarmSound = keyof typeof SOUND_URLS;
export const TIMER_ALARM_SOUNDS = Object.keys(SOUND_URLS) as TimerAlarmSound[];
export const TIMER_ALARM_SECONDS = [5, 10, 30, 60];
export const TIMER_ALARM_DEFAULT_SOUND: TimerAlarmSound = 'beeper';
export const TIMER_ALARM_DEFAULT_SECONDS = 30;

export interface TimerAlarm {
  enabled: boolean;
  sound: TimerAlarmSound;
  seconds: number;
}

// A config-less timer (every one placed before the alarm existed) rings.
export function readTimerAlarm(config: Record<string, PanelConfigValue> | undefined): TimerAlarm {
  return {
    enabled: config?.alarm !== false,
    sound: TIMER_ALARM_SOUNDS.find(s => s === config?.alarmSound) ?? TIMER_ALARM_DEFAULT_SOUND,
    seconds: TIMER_ALARM_SECONDS.find(s => s === config?.alarmSeconds) ?? TIMER_ALARM_DEFAULT_SECONDS,
  };
}

export function timerAlarmUrl(sound: TimerAlarmSound): string {
  return SOUND_URLS[sound];
}

/**
 * Loops the alarm while `ringing`, for `alarm.seconds`. Call the returned `prime`
 * from the Start tap: mobile Safari only plays an element unattended after it
 * has played inside a user gesture.
 */
export function useTimerAlarm(ringing: boolean, alarm: TimerAlarm): () => void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Read at ring time, so a settings edit after the auto-stop does not ring again.
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;

  const element = useCallback(() => {
    audioRef.current ??= new Audio();
    return audioRef.current;
  }, []);

  // Primes even when the alarm is off: it can be switched on mid-countdown.
  const prime = useCallback(() => {
    const audio = element();
    audio.src = timerAlarmUrl(alarmRef.current.sound);
    audio.muted = true;
    // Unmuted means the alarm started ringing before this play resolved.
    audio.play().then(() => { if (audio.muted) audio.pause(); }, () => {});
  }, [element]);

  useEffect(() => {
    const { enabled, sound, seconds } = alarmRef.current;
    if (!ringing || !enabled) return;
    const audio = element();
    audio.src = timerAlarmUrl(sound);
    audio.loop = true;
    audio.muted = false;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    const autoStop = setTimeout(() => audio.pause(), seconds * 1000);
    return () => {
      clearTimeout(autoStop);
      audio.pause();
    };
  }, [element, ringing]);

  return prime;
}
