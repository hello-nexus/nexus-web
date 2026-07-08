// User-facing unit + locale formatting.
//
// Conversion happens at the DISPLAY layer only: callers keep the raw metric
// value (Celsius sensor readings, machine numbers) for logic, thresholds, and
// color-coding, and format through these helpers just before rendering.

export type TempUnit = 'c' | 'f';
export type TimeFormat = 'system' | '12h' | '24h';
// 'dot' = 1,234.56 (period decimal); 'comma' = 1.234,56 (comma decimal).
export type NumberFormat = 'system' | 'dot' | 'comma';

export const TEMP_UNITS: readonly TempUnit[] = ['c', 'f'];
export const TIME_FORMATS: readonly TimeFormat[] = ['system', '12h', '24h'];
export const NUMBER_FORMATS: readonly NumberFormat[] = ['system', 'dot', 'comma'];

export const DEFAULT_TEMP_UNIT: TempUnit = 'c';
export const DEFAULT_TIME_FORMAT: TimeFormat = 'system';
export const DEFAULT_NUMBER_FORMAT: NumberFormat = 'system';

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

// ── Time ────────────────────────────────────────────────────────────────────

// The OS hour cycle doesn't change within a session, so probe it once - callers
// like ClockWidget re-render every second.
let systemHour12: boolean | undefined;

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
