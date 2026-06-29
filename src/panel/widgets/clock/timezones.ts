// IANA time-zone helpers for the clock widget. Intl.DateTimeFormat throws a
// RangeError on an unknown zone, so any user- or config-sourced zone passes
// through safeTimeZone before reaching a formatter - an invalid value would
// otherwise crash the whole panel render tree.

import { CITY_CATALOG } from './cities';

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The zone when valid, otherwise undefined (the formatter then uses local time).
export function safeTimeZone(tz: string | null | undefined): string | undefined {
  return isValidTimeZone(tz) ? tz : undefined;
}

// Selectable zones: the platform's full IANA set, falling back to the
// world-clock city catalog on WebViews without Intl.supportedValuesOf.
export function listTimeZones(): string[] {
  try {
    const list = Intl.supportedValuesOf('timeZone');
    if (list.length > 0) return list;
  } catch {
    // supportedValuesOf unavailable on this WebView
  }
  return [...new Set(CITY_CATALOG.map(c => c.tz))].sort();
}

// "Asia/Tokyo" -> "Asia/Tokyo" with the IANA underscores spaced for display.
export function humanizeTimeZone(tz: string): string {
  return tz.replace(/_/g, ' ');
}

// Current UTC-offset label for a zone, e.g. "UTC+9"; empty when unavailable.
export function formatTimeZoneOffset(now: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(now);
    const name = parts.find(p => p.type === 'timeZoneName')?.value;
    if (name) return name.replace('GMT', 'UTC');
  } catch {
    // invalid zone
  }
  return '';
}
