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

/**
 * The curve the service plays instead of the user's points while the sunset
 * shift is on: today's generated points, hour in fractional hours. Null when
 * the shift is off or there is nothing usable, so the user's curve plays.
 */
export function sunCurve(sunShift: boolean, sun: BrightnessScheduleSun | null | undefined): BrightnessSchedulePoint[] | null {
  if (!sunShift || !sun || sun.status !== 'ok' || !sun.sunPoints || sun.sunPoints.length === 0) return null;
  return sun.sunPoints.map(p => ({ hour: p.min / 60, brightness: p.brightness }));
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
