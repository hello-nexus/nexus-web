// User-facing unit + locale formatting.
//
// Conversion happens at the DISPLAY layer only: callers keep the raw metric
// value (Celsius sensor readings, machine numbers) for logic, thresholds, and
// color-coding, and format through these helpers just before rendering.

export type TempUnit = 'c' | 'f';
export type TimeFormat = 'system' | '12h' | '24h';
// 'dot' = 1,234.56 (period decimal); 'comma' = 1.234,56 (comma decimal).
export type NumberFormat = 'system' | 'dot' | 'comma';

export const DEFAULT_TEMP_UNIT: TempUnit = 'c';
export const DEFAULT_TIME_FORMAT: TimeFormat = 'system';
export const DEFAULT_NUMBER_FORMAT: NumberFormat = 'system';

// Date patterns: ddd = short weekday name, d/dd = day, mmm = short month name,
// m/mm = month number, yy/yyyy = year. 'system' is the locale's own weekday,
// day and month.
export const DATE_FORMATS = [
  'system',
  'ddd, d mmm', 'ddd d mmm', 'ddd, mmm d', 'd mmm', 'mmm d',
  'ddd, d mmm yyyy', 'd mmm yyyy', 'mmm d, yyyy',
  'dd/mm/yy', 'dd/mm/yyyy', 'mm/dd/yy', 'mm/dd/yyyy', 'dd-mm-yy', 'dd-mm-yyyy', 'dd.mm.yy', 'dd.mm.yyyy',
  'yyyy-mm-dd', 'yyyy/mm/dd', 'yyyy. m. d.', 'yyyy年m月d日',
] as const;
export type DateFormat = typeof DATE_FORMATS[number];
export const DEFAULT_DATE_FORMAT: DateFormat = 'system';
// What the Custom chip starts from.
export const DEFAULT_CUSTOM_DATE_FORMAT: DateFormat = 'ddd, d mmm';

// ── Temperature ──────────────────────────────────────────────────────────────

// Service temperature sensors report units as "°C"; match leniently in case a
// bare "C" ever appears.
export function isCelsiusUnit(units: string): boolean {
  return units.replace('°', '').trim().toUpperCase() === 'C';
}

export function convertTemperature(celsius: number, unit: TempUnit): number {
  return unit === 'f' ? celsius * 9 / 5 + 32 : celsius;
}

export function tempUnitSymbol(unit: TempUnit): string {
  return unit === 'f' ? '°F' : '°C';
}

// ── Numbers ────────────────────────────────────────────────────────────────

// A locale whose separators match the chosen format. 'system' resolves to the
// runtime (OS) locale; the explicit formats pin a locale with the wanted
// separators. Only the separators are borrowed - digits stay Latin.
function localeForNumberFormat(fmt: NumberFormat): string | undefined {
  if (fmt === 'dot') return 'en-US';
  if (fmt === 'comma') return 'de-DE';
  return undefined;
}

const numberFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, fmt: NumberFormat, opts?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return String(value);
  const locale = localeForNumberFormat(fmt);
  const key = `${locale ?? 'system'}::${opts ? JSON.stringify(opts) : ''}`;
  let formatter = numberFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, opts);
    numberFormatterCache.set(key, formatter);
  }
  return formatter.format(value);
}

// Grouping + decimal separators for a number format. Source display strings use
// the service's en-US convention (group ',', decimal '.').
let systemSeparators: { group: string; decimal: string } | undefined;
function separatorsFor(fmt: NumberFormat): { group: string; decimal: string } {
  if (fmt === 'dot') return { group: ',', decimal: '.' };
  if (fmt === 'comma') return { group: '.', decimal: ',' };
  if (!systemSeparators) {
    const parts = new Intl.NumberFormat(undefined).formatToParts(11111.1);
    systemSeparators = {
      group: parts.find(p => p.type === 'group')?.value ?? ',',
      decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
    };
  }
  return systemSeparators;
}

// Re-separate every en-US-formatted number in an already-assembled display
// string ("62.5 %", "3.6 GHz", "1,800 RPM", "10.3 / 31.1 GB") to the chosen
// format. This is a pure separator swap - it preserves each number's digits,
// decimal places, and grouping structure, only changing the separator glyphs -
// so it is a no-op when the target already uses a period decimal (the default),
// and never invents or drops grouping the source didn't have. Apply ONLY to
// numeric readouts, never to model names / versions / ids.
const EN_US_NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;
export function localizeNumbers(display: string, fmt: NumberFormat): string {
  const { group, decimal } = separatorsFor(fmt);
  if (group === ',' && decimal === '.') return display;
  return display.replace(EN_US_NUMBER_RE, token => {
    const dot = token.indexOf('.');
    const intPart = dot === -1 ? token : token.slice(0, dot);
    const frac = dot === -1 ? '' : token.slice(dot + 1);
    const newInt = intPart.replace(/,/g, group);
    return frac ? `${newInt}${decimal}${frac}` : newInt;
  });
}

// ── Date ────────────────────────────────────────────────────────────────────

// How much of the chosen pattern a surface shows: 'full' is the pattern as
// picked (the clock), 'year' drops the weekday and guarantees a year (absolute
// dates), 'short' keeps only day and month (chart ticks, compact stamps).
export type DateVariant = 'full' | 'year' | 'short';

export interface DateOptions {
  variant?: DateVariant;
  tz?: string;
  locale?: string;
  // What the surface renders on 'system': its own Intl options, so that
  // choice leaves every surface exactly as it was.
  system?: Intl.DateTimeFormatOptions;
}

const SYSTEM_DATE_OPTIONS: Record<DateVariant, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'short', day: 'numeric', month: 'short' },
  year: { year: 'numeric', month: 'short', day: 'numeric' },
  short: { month: 'short', day: 'numeric' },
};

function patternFor(fmt: DateFormat, variant: DateVariant): string {
  if (variant === 'full') return fmt;
  const noWeekday = fmt.replace(/^ddd,? /, '');
  if (variant === 'short') return noWeekday.replace(/,? yyyy$|[/.-]yy(yy)?$|^yyyy(?:[/-]|\. |年)/, '');
  if (noWeekday.includes('yy')) return noWeekday;
  return noWeekday.startsWith('mmm') ? `${noWeekday}, yyyy` : `${noWeekday} yyyy`;
}

// Names come from the locale; digits stay Latin. An unknown pattern (a value
// written by a newer build) renders as 'system'.
export function formatDate(date: Date, fmt: DateFormat, opts: DateOptions = {}): string {
  const { variant = 'full', locale } = opts;
  const timeZone = opts.tz || undefined;
  if (fmt === 'system' || !DATE_FORMATS.includes(fmt)) {
    return new Intl.DateTimeFormat(locale, { ...(opts.system ?? SYSTEM_DATE_OPTIONS[variant]), timeZone }).format(date);
  }
  const nameParts = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).formatToParts(date);
  const numParts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date);
  const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const year = part(numParts, 'year');
  const month = part(numParts, 'month');
  const day = part(numParts, 'day');
  const tokens: Record<string, string> = {
    yyyy: year,
    yy: year.slice(-2),
    mmm: part(nameParts, 'month'),
    mm: month,
    m: String(Number(month)),
    ddd: part(nameParts, 'weekday'),
    dd: day,
    d: String(Number(day)),
  };
  return patternFor(fmt, variant).replace(/yyyy|yy|mmm|mm|m|ddd|dd|d/g, token => tokens[token]);
}

// A date plus a clock time. `system` carries the surface's full Intl options
// (date and time fields); a custom pattern keeps only their time fields.
export function formatDateTime(
  date: Date,
  fmt: DateFormat,
  system: Intl.DateTimeFormatOptions,
  opts: Omit<DateOptions, 'system'> = {},
): string {
  if (fmt === 'system' || !DATE_FORMATS.includes(fmt)) {
    return new Intl.DateTimeFormat(opts.locale, { ...system, timeZone: opts.tz || system.timeZone }).format(date);
  }
  const { hour, minute, second, hour12, hourCycle } = system;
  const tz = opts.tz || system.timeZone;
  const time = new Intl.DateTimeFormat(opts.locale, { hour, minute, second, hour12, hourCycle, timeZone: tz }).format(date);
  return `${formatDate(date, fmt, { ...opts, tz })} ${time}`;
}

// ── Time ────────────────────────────────────────────────────────────────────

// The OS hour cycle doesn't change within a session, so probe it once - callers
// like ClockWidget re-render every second.
let systemHour12: boolean | undefined;

// DateTimeFormat's hour12 option for a chosen format: undefined on 'system' so
// the locale in play decides. Callers pass a locale that may differ from the OS
// one (the app language), and pinning the OS hour cycle onto it would render a
// German string with English AM/PM. Callers that must have a definite boolean
// (the clock designs, the weather hour strip) use resolveHour12 instead.
export function hour12OptionFor(fmt: TimeFormat): boolean | undefined {
  if (fmt === '12h') return true;
  if (fmt === '24h') return false;
  return undefined;
}

// Whether the clock should render 12-hour (with AM/PM). 'system' derives from
// the OS locale's hour cycle; the explicit formats pin it.
export function resolveHour12(fmt: TimeFormat): boolean {
  if (fmt === '12h') return true;
  if (fmt === '24h') return false;
  if (systemHour12 === undefined) {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    systemHour12 = typeof opts.hour12 === 'boolean'
      ? opts.hour12
      : opts.hourCycle === 'h11' || opts.hourCycle === 'h12';
  }
  return systemHour12;
}
