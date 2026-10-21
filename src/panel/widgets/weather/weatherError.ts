import type { WeatherErrorReason, WeatherSnapshot } from '../../../api/weather';

export type WeatherErrorGroup = 'timeout' | 'unreachable' | 'response';

// http and invalid share one message: the service answered, but not usefully.
export function weatherErrorGroup(reason: WeatherErrorReason | null | undefined): WeatherErrorGroup {
  if (reason === 'timeout') return 'timeout';
  if (reason === 'http' || reason === 'invalid') return 'response';
  return 'unreachable';
}

export function weatherErrorKey(reason: WeatherErrorReason | null | undefined): string {
  return `panel.widget.weather.error.${weatherErrorGroup(reason)}`;
}

export function weatherErrorShortKey(reason: WeatherErrorReason | null | undefined): string {
  return `panel.widget.weather.error.${weatherErrorGroup(reason)}.short`;
}

// True once a fetch settled and there is no reading to draw: the service sent
// an empty snapshot (an old service sends no reason) or nothing at all.
export function weatherHasNoData(snap: WeatherSnapshot | null, loaded: boolean): boolean {
  return loaded && (!snap || !snap.asOf);
}

// Local clock time of the stale reading, or null when asOf does not parse.
export function staleReadingClock(asOf: string | undefined): { hour: number; minute: number } | null {
  if (!asOf) return null;
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return null;
  return { hour: d.getHours(), minute: d.getMinutes() };
}
