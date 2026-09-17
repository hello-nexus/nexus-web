import type { BrightnessSchedulePoint } from '../api/lighting';
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
