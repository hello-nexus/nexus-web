// Pure helpers shared by the System tab's incident timeline and the Cooling
// tab's history chart (CoolingHistorySection / coolingHistoryHelpers.ts).
// Kept side-effect-free (no i18n context, no fetch) so they're covered
// directly by temperatureHelpers.test.ts instead of through component
// rendering.
import { convertTemperature, localizeNumbers, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../lib/units';
import type { DiagnosticsTemperatureEpisode, DiagnosticsTemperatureKind } from '../../../api/diagnostics';

export type TemperatureRangeHours = 24 | 72 | 168 | 336;

export const TEMPERATURE_RANGE_OPTIONS: readonly TemperatureRangeHours[] = [24, 72, 168, 336];

export function temperatureRangeLabelKey(hours: TemperatureRangeHours): string {
  switch (hours) {
    case 24: return 'diagnostics.temperature.range.24h';
    case 72: return 'diagnostics.temperature.range.3d';
    case 168: return 'diagnostics.temperature.range.7d';
    case 336: return 'diagnostics.temperature.range.14d';
  }
}

// One well-separated hue per hardware kind (validated with the dataviz
// skill's validate_palette.js against both app chart surfaces: lightness
// band, chroma floor, adjacent CVD contrast all pass). Kept clear of
// --good/--warn/--bad's hue range since the history chart's own episode band
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

/** `rank` is this id's 0-based position among same-kind series, sorted by id
 *  (see coolingHistoryHelpers.ts's toCoolingTempChartSeries) - never raw
 *  array order, so the same drive/GPU keeps the same shade across refetches
 *  and app restarts. */
export function temperatureSeriesColor(kind: DiagnosticsTemperatureKind, rank: number): string {
  const base = KIND_BASE_COLOR[kind];
  if (rank <= 0) return base;
  const i = (rank - 1) % SHADE_MIX_TARGETS.length;
  return mixHex(base, SHADE_MIX_TARGETS[i], SHADE_MIX_PERCENTS[i]);
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

/** A translucent chart band spanning an episode - the chart draws it behind the lines. */
export function episodeBand(episode: DiagnosticsTemperatureEpisode): { startT: number; endT: number; color: string } {
  return { startT: new Date(episode.startUtc).getTime(), endT: new Date(episode.endUtc).getTime(), color: 'var(--warn)' };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Today as an ISO YYYY-MM-DD in the browser's local zone (the incident
 *  timeline's day picker upper bound and default selection). */
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
