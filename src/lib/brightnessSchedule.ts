import type { BrightnessSchedulePoint } from '../api/lighting';

const MINUTES_PER_DAY = 24 * 60;

/** Minute of the local day, seconds dropped: the service steps the level once
 *  a minute, so the readout matches what the LEDs are doing. */
export function minuteOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Mirror of the service's MasterBrightness.Scheduled: the schedule's level
 * (0..100) at a minute of the day, piecewise-linear between the points and
 * wrapping midnight. An empty schedule is no cap.
 */
export function scheduledBrightness(points: BrightnessSchedulePoint[], minute: number): number {
  if (points.length === 0) return 100;
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const sorted = [...points].sort((a, b) => a.hour - b.hour);
  const first = sorted[0], last = sorted[sorted.length - 1];
  let from: BrightnessSchedulePoint, to: BrightnessSchedulePoint, fromMinute: number, toMinute: number;
  if (m < first.hour * 60) {
    from = last; fromMinute = last.hour * 60 - MINUTES_PER_DAY;
    to = first; toMinute = first.hour * 60;
  } else if (m >= last.hour * 60) {
    from = last; fromMinute = last.hour * 60;
    to = first; toMinute = first.hour * 60 + MINUTES_PER_DAY;
  } else {
    let i = 0;
    while (i < sorted.length - 1 && sorted[i + 1].hour * 60 <= m) i++;
    from = sorted[i]; fromMinute = from.hour * 60;
    to = sorted[i + 1]; toMinute = to.hour * 60;
  }
  const span = toMinute - fromMinute;
  const level = span <= 0 ? from.brightness : from.brightness + (to.brightness - from.brightness) * ((m - fromMinute) / span);
  return Math.max(0, Math.min(100, level));
}
