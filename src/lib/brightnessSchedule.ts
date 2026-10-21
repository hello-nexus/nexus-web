import type { BrightnessSchedulePoint, BrightnessScheduleSun } from '../api/lighting';
import { interpolateCurve, type CurveEasing, type CurveWrap } from './curveEasing';

/** The schedule curve's shape and axis: straight between the hour points,
 *  and circular so the last evening point runs into the first morning one. */
export const SCHEDULE_EASING: CurveEasing = 'linear';
export const SCHEDULE_WRAP: CurveWrap = { min: 0, max: 24 };

/** Minute of the local day, seconds dropped: the service steps the level once
 *  a minute, so the readout matches what the LEDs are doing. */
export function minuteOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Local calendar date as YYYY-MM-DD, the form of the service's `sun.date`. */
export function localDateKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Out-of-box night and day levels of the generated curve. */
export const SUN_DEFAULT_NIGHT = 10;
export const SUN_DEFAULT_DAY = 100;

export interface SunLevels { night: number; day: number }
/** Night points flank the dark hours, day points the lit ones, and the points
 *  at sunrise and sunset sit midway between the two levels. */
export type SunRole = 'night' | 'mid' | 'day';

const ROLE_EPSILON_MIN = 0.01;

/** Which level a generated point follows, from where it sits against today's sun. */
export function sunRole(min: number, sun: { sunriseMin: number | null; sunsetMin: number | null }): SunRole {
  const { sunriseMin: r, sunsetMin: s } = sun;
  if (r === null || s === null) return 'night';
  if (Math.abs(min - r) < ROLE_EPSILON_MIN || Math.abs(min - s) < ROLE_EPSILON_MIN) return 'mid';
  // Past midnight the day wraps: sunset can come before sunrise on the clock.
  const inDay = r <= s ? min > r && min < s : min > r || min < s;
  return inDay ? 'day' : 'night';
}

export function sunRoleLevel(role: SunRole, levels: SunLevels): number {
  return role === 'night' ? levels.night : role === 'day' ? levels.day : Math.round((levels.night + levels.day) / 2);
}

/** A night or day level after a drag, kept within 0..100 and night <= day. */
export function dragSunLevels(role: 'night' | 'day', value: number, levels: SunLevels): SunLevels {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return role === 'night' ? { night: Math.min(v, levels.day), day: levels.day } : { night: levels.night, day: Math.max(v, levels.night) };
}

/**
 * The curve the service plays instead of the user's points while Daylight sync
 * is on: today's generated points, hour in fractional hours. Null when it is
 * off or there is nothing usable, so the user's curve plays. `levels` re-levels
 * the points locally (a drag the service has not answered yet).
 */
export function sunCurve(
  sunShift: boolean, sun: BrightnessScheduleSun | null | undefined, levels?: SunLevels,
): BrightnessSchedulePoint[] | null {
  if (!sunShift || !sun || sun.status !== 'ok' || !sun.sunPoints || sun.sunPoints.length === 0) return null;
  return sun.sunPoints.map(p => ({
    hour: p.min / 60,
    brightness: levels ? sunRoleLevel(sunRole(p.min, sun), levels) : p.brightness,
  }));
}

/**
 * Mirror of the service's MasterBrightness.Scheduled: the schedule's level
 * (0..100) at a minute of the day. An empty schedule is no cap.
 */
export function scheduledBrightness(points: BrightnessSchedulePoint[], minute: number): number {
  if (points.length === 0) return 100;
  const level = interpolateCurve(
    points.map(p => ({ temp: p.hour, speed: p.brightness })),
    minute / 60, SCHEDULE_EASING, SCHEDULE_WRAP,
  );
  return Math.max(0, Math.min(100, level));
}
