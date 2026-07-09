// Pure helpers for the Cooling tab's temperature history chart. Kept
// side-effect-free (no i18n context, no fetch) so they're covered directly
// by temperatureHelpers.test.ts instead of through component rendering.
import { convertTemperature, localizeNumbers, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../lib/units';
import type { DiagnosticsTemperatureAppsResponse, DiagnosticsTemperatureEpisode, DiagnosticsTemperatureKind, DiagnosticsTemperatureSeries } from '../../../api/diagnostics';
import type { TimeSeriesSeries } from '../../../components/common/TimeSeriesChart/TimeSeriesChart';

export type TemperatureRangeHours = 24 | 72 | 168 | 336;

export const TEMPERATURE_RANGE_OPTIONS: readonly TemperatureRangeHours[] = [24, 72, 168, 336];

export const DEFAULT_TEMPERATURE_RANGE_HOURS: TemperatureRangeHours = 168;

export const DEFAULT_TEMPERATURE_RETENTION_DAYS = 90;

export function temperatureRangeLabelKey(hours: TemperatureRangeHours): string {
  switch (hours) {
    case 24: return 'diagnostics.temperature.range.24h';
    case 72: return 'diagnostics.temperature.range.3d';
    case 168: return 'diagnostics.temperature.range.7d';
    case 336: return 'diagnostics.temperature.range.14d';
  }
}

// Fixed order both the legend and the per-kind color ranking sort by, so
// neither reshuffles when the server returns kinds in a different order or
// a refetch changes array order.
const KIND_ORDER: readonly DiagnosticsTemperatureKind[] = ['cpu', 'gpu', 'ram', 'storage'];

// One well-separated hue per hardware kind (validated with the dataviz
// skill's validate_palette.js against both app chart surfaces: lightness
// band, chroma floor, adjacent CVD contrast all pass). Kept clear of
// --good/--warn/--bad's hue range since this chart's own episode band
// already renders --warn for "sustained high temperature".
const KIND_BASE_COLOR: Record<DiagnosticsTemperatureKind, string> = {
  cpu: '#3a89e8',
  gpu: '#00a1ab',
  ram: '#a860cd',
  storage: '#d4569c',
};

// A second/third series of the same kind (two GPUs, two drives) shades that
// kind's base hue instead of taking an unrelated color, alternating
// lighter/darker so same-kind series read as a family in the legend.
const SHADE_MIX_TARGETS: readonly ('white' | 'black')[] = ['white', 'black', 'white', 'black'];
const SHADE_MIX_PERCENTS: readonly number[] = [70, 75, 45, 55];

/** Mixes a #rrggbb base toward white/black by `basePercent` in sRGB, returning
 *  a plain #rrggbb. Byte-identical to `color-mix(in srgb, base p%, target)` for
 *  opaque colors, but a value the SVG chart can always render (color-mix in an
 *  SVG presentation attribute isn't exercised by the jsdom test suite). */
function mixHex(baseHex: string, target: 'white' | 'black', basePercent: number): string {
  const targetChannel = target === 'white' ? 255 : 0;
  const p = basePercent / 100;
  const channels = [1, 3, 5].map(i => {
    const c = parseInt(baseHex.slice(i, i + 2), 16);
    return Math.round(c * p + targetChannel * (1 - p));
  });
  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** `rank` is this id's 0-based position among same-kind series, sorted by
 *  id (see sortTemperatureSeries) - never raw array order, so the same
 *  drive/GPU keeps the same shade across refetches and app restarts. */
export function temperatureSeriesColor(kind: DiagnosticsTemperatureKind, rank: number): string {
  const base = KIND_BASE_COLOR[kind];
  if (rank <= 0) return base;
  const i = (rank - 1) % SHADE_MIX_TARGETS.length;
  return mixHex(base, SHADE_MIX_TARGETS[i], SHADE_MIX_PERCENTS[i]);
}

/** Stable display/legend order: kind (KIND_ORDER), then id - independent of
 *  whatever order the server or mock returned the series in. */
export function sortTemperatureSeries(series: readonly DiagnosticsTemperatureSeries[]): DiagnosticsTemperatureSeries[] {
  return [...series].sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : a.id.localeCompare(b.id);
  });
}

/**
 * Maps the API's temperature series onto TimeSeriesChart's generic shape,
 * sorted and colored by sortTemperatureSeries/temperatureSeriesColor above -
 * a fixed kind-keyed palette instead of lib/monitoringStore's colorFor,
 * whose shared id -> color map assigns by session-wide first-call order and
 * is meant for the many dynamically-named process/app series elsewhere in
 * the app, not a small fixed set of hardware kinds. Values stay in raw
 * Celsius; the chart's own valueFormat converts to the user's preferred
 * unit at render time.
 */
export function toChartSeries(series: readonly DiagnosticsTemperatureSeries[]): TimeSeriesSeries[] {
  const sorted = sortTemperatureSeries(series);
  const kindRank = new Map<DiagnosticsTemperatureKind, number>();
  return sorted.map(s => {
    const rank = kindRank.get(s.kind) ?? 0;
    kindRank.set(s.kind, rank + 1);
    return {
      id: s.id,
      name: s.name,
      color: temperatureSeriesColor(s.kind, rank),
      points: s.points.map(p => ({ t: p.t, avg: p.avg, max: p.max })),
    };
  });
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

export interface AppHoverEntry {
  appId: string;
  appName: string;
  ms: number;
}

const MAX_HOVER_APPS = 4;

/**
 * Apps active during the tier-width bucket containing hovered timestamp `t`,
 * dominant (highest ms) first, capped to MAX_HOVER_APPS. Re-sorts by ms
 * rather than trusting the server's order, matching sortTemperatureSeries's
 * stance elsewhere in this file. Returns [] when data hasn't arrived, is
 * unsupported, or no bucket covers `t`.
 */
export function appsForHoverBucket(data: DiagnosticsTemperatureAppsResponse | null, t: number): AppHoverEntry[] {
  if (!data?.supported) return [];
  const bucketMs = data.bucketMinutes * 60_000;
  const bucket = data.buckets.find(b => t >= b.startUtcMs && t < b.startUtcMs + bucketMs);
  if (!bucket) return [];
  return [...bucket.apps]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_HOVER_APPS)
    .map(a => ({ appId: a.appId, appName: a.appName, ms: a.ms }));
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Today as an ISO YYYY-MM-DD in the browser's local zone (the day picker's
 *  upper bound and the default selection). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Earliest calendar day the day picker may select: retentionDays back from
 *  `today`, inclusive (a retentionDays of 90 with today selected still allows
 *  today itself, i.e. the range spans exactly retentionDays days). */
export function minSelectableTemperatureDate(today: string, retentionDays: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - (retentionDays - 1));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** Formats an ISO YYYY-MM-DD day for display (empty-day message, etc.). */
export function formatTemperatureDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
