import { formatDate, type DateFormat } from '../../../../lib/units';

// Shared time-format helpers for clock designs: "HH:MM[:SS]" string,
// an "AM"/"PM" suffix in 12-hour mode, and the dim date/timezone meta line.

export function formatTime(
  now: Date,
  tz?: string,
  showSeconds?: boolean,
  hour12?: boolean,
): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: hour12 ?? false,
    timeZone: tz || undefined,
  }).format(now).replace(/\s?[APap][Mm]/, '');
}

export function getAmPm(now: Date, tz?: string, hour12?: boolean): string {
  if (!hour12) return '';
  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: true,
    timeZone: tz || undefined,
  }).format(now);
  return formatted.includes('AM') ? 'AM' : 'PM';
}

// The line under the time: date, date + short zone name, or zone alone.
export function formatMetaLine(
  now: Date,
  tz: string | undefined,
  showDate: boolean,
  showTimezone: boolean,
  dateFormat: DateFormat,
): string {
  const parts: string[] = [];
  if (showDate) parts.push(formatDate(now, dateFormat, tz));
  if (showTimezone) {
    const zone = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
      timeZone: tz || undefined,
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
    if (zone) parts.push(zone);
  }
  return parts.join(' · ');
}

function getTimeParts(now: Date, tz?: string) {
  if (!tz) {
    return { hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, timeZone: tz,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  return { hours: get('hour'), minutes: get('minute'), seconds: get('second') };
}

// Hand angles in degrees, clockwise from 12. Sub-degree minute/hour offsets
// give continuous rotation instead of a per-minute jump. `progress` is each
// unit's 0-1 position through its cycle, for faces that draw arcs or bars
// rather than hands.
export function getClockAngles(now: Date, tz?: string) {
  const { hours, minutes, seconds } = getTimeParts(now, tz);
  return {
    hours,
    minutes,
    seconds,
    hourDeg: (hours % 12) * 30 + minutes * 0.5,
    minuteDeg: minutes * 6 + seconds * 0.1,
    secondDeg: seconds * 6,
    hourProgress: ((hours % 12) + minutes / 60) / 12,
    minuteProgress: (minutes + seconds / 60) / 60,
    secondProgress: seconds / 60,
  };
}
