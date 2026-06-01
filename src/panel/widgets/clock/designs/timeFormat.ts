// Shared time-format helpers for clock designs: "HH:MM[:SS]" string
// plus an "AM"/"PM" suffix in 12-hour mode.

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
