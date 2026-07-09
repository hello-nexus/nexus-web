// Pure helpers for the Cooling tab's temperature history chart. Kept
// side-effect-free (no i18n context, no fetch) so they're covered directly
// by temperatureHelpers.test.ts instead of through component rendering.
import { colorFor } from '../../../lib/monitoringStore';
import { convertTemperature, localizeNumbers, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../lib/units';
import type { DiagnosticsTemperatureEpisode, DiagnosticsTemperatureSeries } from '../../../api/diagnostics';
import type { TimeSeriesSeries } from '../../../components/common/TimeSeriesChart/TimeSeriesChart';

export type TemperatureRangeHours = 24 | 72 | 168 | 720;

export const TEMPERATURE_RANGE_OPTIONS: readonly TemperatureRangeHours[] = [24, 72, 168, 720];

export const DEFAULT_TEMPERATURE_RANGE_HOURS: TemperatureRangeHours = 168;

export function temperatureRangeLabelKey(hours: TemperatureRangeHours): string {
  switch (hours) {
    case 24: return 'diagnostics.temperature.range.24h';
    case 72: return 'diagnostics.temperature.range.3d';
    case 168: return 'diagnostics.temperature.range.7d';
    case 720: return 'diagnostics.temperature.range.30d';
  }
}

/**
 * Maps the API's temperature series onto TimeSeriesChart's generic shape.
 * Colors follow the monitoring palette convention (lib/monitoringStore's
 * colorFor - the same stable id -> color map every per-entity chart in the
 * app uses for CPU/Memory/Network process breakdowns and Screen Time).
 * Values stay in raw Celsius; the chart's own valueFormat converts to the
 * user's preferred unit at render time.
 */
export function toChartSeries(series: readonly DiagnosticsTemperatureSeries[]): TimeSeriesSeries[] {
  return series.map(s => ({
    id: s.id,
    name: s.name,
    color: colorFor(s.id),
    points: s.points.map(p => ({ t: p.t, avg: p.avg, max: p.max })),
  }));
}

/** X-axis tick label granularity appropriate to the selected range. */
export function xTickFormatForRange(hours: TemperatureRangeHours): (t: number) => string {
  if (hours <= 24) return (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (hours <= 168) return (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric' });
  return (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Converts a raw Celsius value to the user's preferred unit and formats it with its symbol. */
export function formatTemperatureCelsius(celsius: number, tempUnit: TempUnit, numberFormat: NumberFormat): string {
  return localizeNumbers(`${Math.round(convertTemperature(celsius, tempUnit))}${tempUnitSymbol(tempUnit)}`, numberFormat);
}

export interface EpisodeDurationToken {
  key: string;
  params: Record<string, string>;
}

/** Buckets an episode's startUtc/endUtc span into a diagnostics.duration.* token, mirroring diagnosticsHelpers' durationToken but from ISO timestamps instead of a microsecond counter. */
export function episodeDurationToken(startUtc: string, endUtc: string): EpisodeDurationToken {
  const ms = Math.max(0, new Date(endUtc).getTime() - new Date(startUtc).getTime());
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return { key: 'diagnostics.duration.minutes', params: { m: String(totalMinutes) } };
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { key: 'diagnostics.duration.hoursMinutes', params: { h: String(hours), m: String(minutes) } };
}

/** A translucent chart band spanning an episode - the chart draws it behind the lines. */
export function episodeBand(episode: DiagnosticsTemperatureEpisode): { startT: number; endT: number; color: string } {
  return { startT: new Date(episode.startUtc).getTime(), endT: new Date(episode.endUtc).getTime(), color: 'var(--warn)' };
}

/**
 * The full "<name> reached <peak> for <duration> on <date>" callout line for
 * one episode. `translate` is the caller's t() - passed in rather than
 * imported so this stays pure/testable.
 */
export function episodeSentence(
  episode: DiagnosticsTemperatureEpisode,
  tempUnit: TempUnit,
  numberFormat: NumberFormat,
  translate: (key: string, params?: Record<string, string>) => string,
): string {
  const token = episodeDurationToken(episode.startUtc, episode.endUtc);
  return translate('diagnostics.temperature.episode', {
    name: episode.name,
    peak: formatTemperatureCelsius(episode.peakC, tempUnit, numberFormat),
    duration: translate(token.key, token.params),
    date: new Date(episode.endUtc).toLocaleDateString(),
  });
}
