import type { WeatherErrorReason, WeatherSnapshot } from '../../../api/weather';

export type WeatherErrorGroup = 'timeout' | 'unreachable' | 'response';

// http and invalid share one message: the service answered, but not usefully.
export function weatherErrorGroup(reason: WeatherErrorReason | null | undefined): WeatherErrorGroup {
  if (reason === 'timeout') return 'timeout';
  if (reason === 'http' || reason === 'invalid') return 'response';
  return 'unreachable';
}

export function weatherErrorShortKey(reason: WeatherErrorReason | null | undefined): string {
  return `panel.widget.weather.error.${weatherErrorGroup(reason)}.short`;
}

// True once a fetch settled and there is no reading to draw: the service sent
// an empty snapshot (an old service sends no reason) or nothing at all.
export function weatherHasNoData(snap: WeatherSnapshot | null, loaded: boolean): boolean {
  return loaded && (!snap || !snap.asOf);
}

export interface StaleStamp {
  hour: number;
  minute: number;
  // False when the reading is from an earlier day than now, in the location's time.
  today: boolean;
  // UTC-field date carrying the location-local calendar day, for formatting with timeZone UTC.
  day: Date;
}

// When the stale reading was taken, in the snapshot's location time (browser
// time when the service sent no offset); null when asOf does not parse.
export function staleReadingStamp(snap: WeatherSnapshot | null, nowMs: number): StaleStamp | null {
  if (!snap?.asOf) return null;
  const at = new Date(snap.asOf).getTime();
  if (Number.isNaN(at)) return null;
  const offsetMs = (snap.utcOffsetSeconds ?? -new Date(at).getTimezoneOffset() * 60) * 1000;
  const shifted = new Date(at + offsetMs);
  const nowShifted = new Date(nowMs + offsetMs);
  const dayKey = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  return {
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    today: dayKey(shifted) === dayKey(nowShifted),
    day: shifted,
  };
}
