import { BUILTIN_SENSOR_CATEGORY, type BuiltInSensorKind, type NewSensorAlertRule, type SensorAlertRule, type SensorAlertState, type SensorRef } from '../../../api/diagnosticsAlerts';
import { SLIDESHOW_INTERVALS, slideshowIntervalLabel } from '../../../panel/slideshow/slideshow';
import type { Language } from '../../../lib/settings';
import { convertTemperature, formatDateTime, formatNumber, hour12OptionFor, tempUnitSymbol, type DateFormat, type NumberFormat, type TempUnit, type TimeFormat } from '../../../lib/units';

export interface AlertUnitPrefs { monitoringTempUnit: TempUnit; numberFormat: NumberFormat; monitoringWholeNumbers: boolean }

/** Sensor types a threshold makes sense for, in picker order. */
export const ALERT_SENSOR_TYPES = ['Temperature', 'Current', 'Power', 'Voltage', 'Fan', 'Load', 'Clock', 'Control', 'Level'] as const;

/** Resolver categories the service can re-find a sensor in. */
export const ALERT_SENSOR_CATEGORIES = ['cpu', 'gpu', 'memory', 'motherboard', 'storage', 'smart', 'psu', 'cooler'] as const;


export const DEFAULT_RAISE_SECONDS = 5;
export const DEFAULT_CLEAR_SECONDS = 5;
export const MAX_DELAY_SECONDS = 600;

/** The delay choices in seconds: Instantly, then the shared slideshow intervals the service accepts, plus a stored off-list value in place. */
export function delayChoices(current: number): number[] {
  const all = new Set<number>([0, ...SLIDESHOW_INTERVALS.filter(s => s <= MAX_DELAY_SECONDS), current]);
  return [...all].sort((a, b) => a - b);
}

/** A delay as a label: Instantly for zero, else the slideshow interval wording. */
export function delayLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  language: Language,
  seconds: number,
): string {
  return seconds <= 0 ? t('diagnostics.alerts.delay.instant') : slideshowIntervalLabel(t, language, seconds);
}

export interface Bounds { min: number; max: number }

interface TypeSpec {
  unit: string;
  /** Decimal places of a stored or displayed value. */
  decimals: number;
  /** Slider step in the displayed unit. */
  step: number;
  /** Upper limit seed when the sensor has no usable reading. */
  fallbackHigh: number;
}

const TYPE_SPECS: Record<string, TypeSpec> = {
  Temperature: { unit: '', decimals: 1, step: 1, fallbackHigh: 80 },
  Current: { unit: 'A', decimals: 1, step: 0.1, fallbackHigh: 10 },
  Power: { unit: 'W', decimals: 0, step: 1, fallbackHigh: 100 },
  Voltage: { unit: 'V', decimals: 2, step: 0.01, fallbackHigh: 13 },
  Fan: { unit: 'RPM', decimals: 0, step: 10, fallbackHigh: 3000 },
  Load: { unit: '%', decimals: 0, step: 1, fallbackHigh: 90 },
  Clock: { unit: 'MHz', decimals: 0, step: 10, fallbackHigh: 4000 },
  Control: { unit: '%', decimals: 0, step: 1, fallbackHigh: 90 },
  Level: { unit: '%', decimals: 0, step: 1, fallbackHigh: 90 },
};

const GENERIC_SPEC: TypeSpec = { unit: '', decimals: 1, step: 1, fallbackHigh: 100 };

const specOf = (type: string): TypeSpec => TYPE_SPECS[type] ?? GENERIC_SPEC;

const roundTo = (v: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** Unit suffix for a sensor type, in the user's temperature unit. */
export function unitSuffix(type: string, tempUnit: TempUnit): string {
  return type === 'Temperature' ? tempUnitSymbol(tempUnit) : specOf(type).unit;
}

/** Slider step in the displayed unit. */
export function stepFor(type: string): number {
  return specOf(type).step;
}

/** A stored (native) value as the user sees it: Fahrenheit for a temperature when the user prefers it. */
export function toDisplay(value: number, type: string, tempUnit: TempUnit): number {
  return type === 'Temperature' ? roundTo(convertTemperature(value, tempUnit), 1) : value;
}

/** A value the user typed or dragged to, back in the stored unit; temperatures go to Celsius rounded to one decimal. */
export function fromDisplay(value: number, type: string, tempUnit: TempUnit): number {
  if (type === 'Temperature') return roundTo(tempUnit === 'f' ? (value - 32) * 5 / 9 : value, 1);
  return roundTo(value, specOf(type).decimals + 1);
}

/** A displayed value snapped to the slider step, so a converted Fahrenheit value sits on the grid. */
export function snapDisplay(value: number, type: string): number {
  const step = stepFor(type);
  return roundTo(Math.round(value / step) * step, step < 1 ? 2 : 0);
}

// Types the whole-numbers monitoring setting rounds to an integer.
const WHOLE_NUMBER_TYPES = new Set(['Temperature', 'Power', 'Load', 'Control', 'Level']);

/** A value with its unit, in the user's temperature unit and number format; whole-number types drop decimals when asked. */
export function formatAlertValue(value: number, type: string, tempUnit: TempUnit, numberFormat: NumberFormat, wholeNumbers = false): string {
  return formatDisplayValue(toDisplay(value, type, tempUnit), type, tempUnit, numberFormat, wholeNumbers);
}

/** Formats a value already in the display unit, with its unit suffix. */
export function formatDisplayValue(shown: number, type: string, tempUnit: TempUnit, numberFormat: NumberFormat, wholeNumbers = false): string {
  const spec = specOf(type);
  const decimals = wholeNumbers && WHOLE_NUMBER_TYPES.has(type) ? 0 : spec.decimals;
  const text = formatNumber(shown, numberFormat, { maximumFractionDigits: decimals });
  const unit = unitSuffix(type, tempUnit);
  if (!unit) return text;
  return type === 'Temperature' || unit === '%' ? `${text}${unit}` : `${text} ${unit}`;
}

/** Native slider bounds for a sensor type given its observed reading, widened to include the set limits. */
export function baseBounds(type: string, observed: number | null, low: number | null, high: number | null): Bounds {
  const seen = observed !== null && Number.isFinite(observed) ? observed : null;
  let bounds: Bounds;
  switch (type) {
    case 'Temperature': bounds = { min: 0, max: 120 }; break;
    case 'Load': case 'Control': case 'Level': bounds = { min: 0, max: 100 }; break;
    case 'Current': bounds = { min: 0, max: Math.max(15, 2 * (seen ?? 0)) }; break;
    case 'Power': bounds = { min: 0, max: Math.max(100, 1.5 * (seen ?? 0)) }; break;
    case 'Fan': bounds = { min: 0, max: Math.max(5000, 1.2 * (seen ?? 0)) }; break;
    case 'Clock': bounds = { min: 0, max: Math.max(5000, 1.2 * (seen ?? 0)) }; break;
    case 'Voltage': {
      const set = [low, high].filter((v): v is number => v !== null);
      const center = seen ?? (set.length ? set.reduce((a, b) => a + b, 0) / set.length : 12);
      const spread = Math.max(Math.abs(center) * 0.25, 0.5);
      bounds = { min: center - spread, max: center + spread };
      break;
    }
    default: {
      const top = Math.max(100, 1.2 * (seen ?? 0));
      bounds = { min: 0, max: top };
    }
  }
  return widenBounds(bounds, [low, high]);
}

/** Bounds grown (never shrunk) to include every given value. */
export function widenBounds(bounds: Bounds, values: ReadonlyArray<number | null | undefined>): Bounds {
  let { min, max } = bounds;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Display bounds grown by one step past a set limit that sits on an end of the track, so the end of the track always means no limit. */
export function padBounds(bounds: Bounds, low: number | null, high: number | null, step: number): Bounds {
  const decimals = step < 1 ? 2 : 0;
  return {
    min: low !== null && low <= bounds.min ? roundTo(low - step, decimals) : bounds.min,
    max: high !== null && high >= bounds.max ? roundTo(high + step, decimals) : bounds.max,
  };
}

/** Bounds in the displayed unit, snapped outward to the slider step so both ends sit on the grid. */
export function displayBounds(bounds: Bounds, type: string, tempUnit: TempUnit): Bounds {
  const step = stepFor(type);
  const lo = toDisplay(bounds.min, type, tempUnit);
  const hi = toDisplay(bounds.max, type, tempUnit);
  const decimals = step < 1 ? 2 : 0;
  return {
    min: roundTo(Math.floor(lo / step + 1e-9) * step, decimals),
    max: roundTo(Math.ceil(hi / step - 1e-9) * step, decimals),
  };
}

/** The upper limit a new rule starts with: a fifth above the reading, rounded to the sensor's precision. */
export function defaultHigh(type: string, observed: number | null): number {
  const spec = specOf(type);
  if (observed === null || !Number.isFinite(observed) || observed <= 0) return spec.fallbackHigh;
  const decimals = type === 'Temperature' ? 0 : spec.decimals;
  const next = roundTo(observed * 1.2, decimals);
  return next > observed ? next : spec.fallbackHigh;
}

export function sensorRefOf(category: string, sensor: { id: string; name: string; type: string; parent: { name: string } }): SensorRef {
  return { category, id: sensor.id, name: sensor.name, type: sensor.type, parentName: sensor.parent.name };
}

/** A new rule: upper limit on a fifth above the reading, lower limit off. */
export function defaultRule(sensor: SensorRef, observed: number | null): NewSensorAlertRule {
  return {
    enabled: true,
    sensor,
    low: null,
    high: defaultHigh(sensor.type, observed),
    raiseAfterSeconds: DEFAULT_RAISE_SECONDS,
    clearAfterSeconds: DEFAULT_CLEAR_SECONDS,
    severity: 'watch',
    notifyDesktop: true,
    showInHealth: true,
    repeatMinutes: 0,
  };
}

/** The limit a freshly enabled side starts at: a fifth beyond the reading, kept a gap clear of the other limit. Not clamped to the bounds, since the track widens to it. */
export function seedBound(
  side: 'low' | 'high',
  type: string,
  observed: number | null,
  bounds: Bounds,
  other: number | null,
): number {
  const step = stepFor(type);
  const gap = Math.max(step, (bounds.max - bounds.min) / 40);
  const decimals = specOf(type).decimals + 1;
  const around = observed !== null && Number.isFinite(observed) ? observed : (bounds.min + bounds.max) / 2;
  let v = side === 'high' ? around * 1.2 : around * 0.8;
  if (other !== null) v = side === 'high' ? Math.max(v, other + gap) : Math.min(v, other - gap);
  return roundTo(v, decimals);
}

export type AlertChipState = 'ok' | 'pending' | 'active' | 'unavailable';

/** The state a rule's header chip shows; a disabled rule shows none. */
export function chipState(rule: SensorAlertRule, state: SensorAlertState | undefined): AlertChipState | null {
  if (!rule.enabled) return null;
  return state?.state ?? 'ok';
}

export type AlertRowState = AlertChipState | 'disabled';

/** The state a Summary row shows: the chip state, or disabled for a rule that is switched off. */
export function rowState(rule: SensorAlertRule, state: SensorAlertState | undefined): AlertRowState {
  return chipState(rule, state) ?? 'disabled';
}

/** Locale key of a state's chip. A sensor the PC does not report reads "Not reported", not as a fault. */
export function stateLabelKey(kind: AlertRowState): string {
  return kind === 'unavailable' ? 'diagnostics.sensors.notReported' : `diagnostics.alerts.state.${kind}`;
}

/** Badge color of a state: ok good, pending warn, active in the rule's tone (watch warn, act bad), lost or disabled muted. */
export function stateColor(kind: AlertRowState, rule: SensorAlertRule): string {
  switch (kind) {
    case 'ok': return 'var(--good)';
    case 'pending': return 'var(--warn)';
    case 'active': return rule.severity === 'act' ? 'var(--bad)' : 'var(--warn)';
    default: return 'var(--text-dim)';
  }
}

/** A sensor's card and row label: the parent device unless the name already carries it. */
export function sensorLabel(sensor: SensorRef): string {
  const { name, parentName } = sensor;
  if (!parentName || name.toLowerCase().includes(parentName.toLowerCase())) return name;
  return `${parentName} ${name}`;
}

/** Native bounds (Celsius) the service clamps a built-in's upper limit to. */
const BUILT_IN_LIMIT_BOUNDS: Record<BuiltInSensorKind, Bounds> = {
  cpuTemp: { min: 60, max: 105 },
  gpuTemp: { min: 60, max: 105 },
  storageTemp: { min: 40, max: 90 },
  ramTemp: { min: 40, max: 90 },
};

/** A built-in component temperature rule: always present, can be turned off but not deleted. */
export function isBuiltIn(rule: SensorAlertRule): boolean {
  return Boolean(rule.builtIn);
}

/** The slider bounds of a built-in's limit, or null for a user rule. */
export function builtInLimitBounds(rule: SensorAlertRule): Bounds | null {
  return rule.builtIn ? BUILT_IN_LIMIT_BOUNDS[rule.builtIn] : null;
}

/** A rule's name: the device name a built-in carries, else the sensor's own label. */
export function ruleLabel(rule: SensorAlertRule): string {
  return rule.builtIn ? rule.sensor.name : sensorLabel(rule.sensor);
}

/** A finished alert still waiting for the user to dismiss it. */
export function hasEndedAlert(state: SensorAlertState | undefined): state is SensorAlertState {
  return Boolean(state?.endedAt);
}

/** The one-line text of an active alert: the sensor, its limit and the current reading, in the user's units. */
export function alertLine(
  t: (key: string, params?: Record<string, string | number>) => string,
  rule: SensorAlertRule,
  state: SensorAlertState,
  prefs: AlertUnitPrefs,
): string {
  const type = rule.sensor.type;
  const ended = state.state !== 'active' && hasEndedAlert(state);
  const below = (ended ? state.endedDirection : state.direction) === 'below';
  const fmt = (v: number | null | undefined) => (v == null ? '-' : formatAlertValue(v, type, prefs.monitoringTempUnit, prefs.numberFormat, prefs.monitoringWholeNumbers));
  if (ended) {
    return t(below ? 'diagnostics.alerts.banner.ended.below' : 'diagnostics.alerts.banner.ended.above', {
      name: ruleLabel(rule), limit: fmt(state.endedThreshold ?? (below ? rule.low : rule.high)), peak: fmt(state.endedPeak),
    });
  }
  return t(below ? 'diagnostics.alerts.notice.below' : 'diagnostics.alerts.notice.above', {
    name: ruleLabel(rule), limit: fmt(below ? rule.low : rule.high), value: fmt(state.value ?? state.extreme),
  });
}

export interface AlertBannerPrefs extends AlertUnitPrefs { timeFormat: TimeFormat; dateFormat: DateFormat }

/** An alert still waiting to be dismissed: the rule is on and either active and not acknowledged, or finished and not dismissed. */
export function isBannerAlert(rule: SensorAlertRule, state: SensorAlertState | undefined): state is SensorAlertState {
  if (!rule.enabled || !state) return false;
  return state.state === 'active' ? !state.acknowledged : hasEndedAlert(state);
}

/** When the alert began, in local time: the clock time for today, with the date for an earlier day. */
function sinceLabel(since: string | null | undefined, nowMs: number, prefs: AlertBannerPrefs, language: Language): string {
  const date = since ? new Date(since) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  const sameDay = date.toDateString() === new Date(nowMs).toDateString();
  return formatDateTime(
    date,
    prefs.dateFormat,
    { ...(sameDay ? {} : { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit', hour12: hour12OptionFor(prefs.timeFormat) },
    { locale: language },
  );
}

/** The two lines of an alert's banner, in the user's units. Active: sensor, limit, start time and extreme, then the current reading. Finished: sensor, limit and extreme, then when it came back in range. */
export function alertBannerText(
  t: (key: string, params?: Record<string, string | number>) => string,
  rule: SensorAlertRule,
  state: SensorAlertState,
  prefs: AlertBannerPrefs,
  language: Language,
  nowMs: number,
): { title: string; detail: string } {
  const type = rule.sensor.type;
  const fmt = (v: number | null | undefined) => (v == null ? '-' : formatAlertValue(v, type, prefs.monitoringTempUnit, prefs.numberFormat, prefs.monitoringWholeNumbers));
  if (state.state !== 'active' && hasEndedAlert(state)) {
    return {
      title: alertLine(t, rule, state, prefs),
      detail: t('diagnostics.alerts.banner.ended.detail', { time: sinceLabel(state.endedAt, nowMs, prefs, language) }),
    };
  }
  const below = state.direction === 'below';
  return {
    title: t(below ? 'diagnostics.alerts.banner.below' : 'diagnostics.alerts.banner.above', {
      name: ruleLabel(rule),
      limit: fmt(below ? rule.low : rule.high),
      time: sinceLabel(state.since, nowMs, prefs, language),
      peak: fmt(state.extreme ?? state.value),
    }),
    detail: t('diagnostics.alerts.banner.detail', { value: fmt(state.value) }),
  };
}

/** The identity a sensor is tracked by: its resolver category and id. */
function sensorKey(sensor: SensorRef): string {
  return `${sensor.category}\u0000${sensor.id}`;
}

/** The entry already tracking `sensor`, other than `exceptId`, or undefined. A built-in without a resolver sensor of its own never matches. */
export function findTrackedRule(rules: readonly SensorAlertRule[], sensor: SensorRef, exceptId?: string): SensorAlertRule | undefined {
  const key = sensorKey(sensor);
  return rules.find(r => r.id !== exceptId && r.sensor.category !== BUILTIN_SENSOR_CATEGORY && sensorKey(r.sensor) === key);
}

/** A row's title and subtitle. Every entry reads alike: the device, then the exact sensor tracked (a built-in's comes from the service when it reports one). */
export function rowTitles(rule: SensorAlertRule): { title: string; subtitle: string | undefined } {
  if (isBuiltIn(rule)) return { title: rule.sensor.name, subtitle: rule.sensor.sourceName || undefined };
  const { name, parentName } = rule.sensor;
  return parentName ? { title: parentName, subtitle: name } : { title: name, subtitle: undefined };
}
