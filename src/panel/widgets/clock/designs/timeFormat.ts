// Shared time-format helpers for clock designs (LED, Dots, Rolling, Matrix,
// SplitFlap). Each design renders a different visual but all need the same
// "HH:MM[:SS]" string and an "AM"/"PM" suffix when 12-hour mode is on.

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
