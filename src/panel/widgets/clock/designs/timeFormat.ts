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
): string {
  const parts: string[] = [];
  if (showDate) {
    parts.push(new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz || undefined,
    }).format(now));
  }
  if (showTimezone) {
    const zone = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
      timeZone: tz || undefined,
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
    if (zone) parts.push(zone);
  }
  return parts.join(' · ');
}
