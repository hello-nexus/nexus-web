import type { NewSensorAlertRule, SensorAlertRule, SensorAlertState, SensorRef } from '../../../api/diagnosticsAlerts';
import { convertTemperature, formatNumber, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../lib/units';

/** Sensor types a threshold makes sense for, in picker order. */
export const ALERT_SENSOR_TYPES = ['Temperature', 'Current', 'Power', 'Voltage', 'Fan', 'Load', 'Clock', 'Control', 'Level'] as const;

/** Resolver categories the service can re-find a sensor in. */
export const ALERT_SENSOR_CATEGORIES = ['cpu', 'gpu', 'memory', 'motherboard', 'storage', 'psu', 'cooler'] as const;

export const REPEAT_OPTIONS_MINUTES = [0, 5, 15, 60] as const;

export const DEFAULT_RAISE_SECONDS = 5;
export const DEFAULT_CLEAR_SECONDS = 5;
export const MAX_DELAY_SECONDS = 600;

export interface Bounds { min: number; max: number }

interface TypeSpec {
  unit: string;
  /** Decimal places of a stored or displayed value. */
  decimals: number;
  /** Slider step in the displayed unit. */
  step: number;
  /** Threshold seed when the sensor has no usable reading. */
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

/** A value the user typed or dragged to, back in the stored unit; temperatures go to Celsius rounded to 0.1. */
export function fromDisplay(value: number, type: string, tempUnit: TempUnit): number {
  if (type === 'Temperature') return roundTo(tempUnit === 'f' ? (value - 32) * 5 / 9 : value, 1);
  return roundTo(value, specOf(type).decimals + 1);
}

/** "62.4°C", "9.5 A", "1200 RPM", with the user's number format. */
export function formatAlertValue(value: number, type: string, tempUnit: TempUnit, numberFormat: NumberFormat): string {
  const shown = toDisplay(value, type, tempUnit);
  const spec = specOf(type);
  const text = formatNumber(shown, numberFormat, { maximumFractionDigits: spec.decimals });
  const unit = unitSuffix(type, tempUnit);
  if (!unit) return text;
  return type === 'Temperature' || unit === '%' ? `${text}${unit}` : `${text} ${unit}`;
}

/** Native slider bounds for a sensor type given its observed reading, before widening for set limits. */
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

/** The upper limit a new rule starts with: the reading times 1.2, rounded to the sensor's precision. */
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

/** A new rule: upper limit on at reading x 1.2, lower limit off. */
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

/** The limit a freshly enabled side starts at: 20 percent beyond the reading, kept clear of the other limit. */
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
  return roundTo(Math.min(bounds.max, Math.max(bounds.min, v)), decimals);
}

export type AlertChipState = 'ok' | 'pending' | 'active' | 'unavailable';

/** The state a rule's header chip shows; a disabled rule shows none. */
export function chipState(rule: SensorAlertRule, state: SensorAlertState | undefined): AlertChipState | null {
  if (!rule.enabled) return null;
  return state?.state ?? 'ok';
}

/** Rules in an active, unacknowledged episode, worst severity first. */
export function activeAlerts(rules: SensorAlertRule[], states: SensorAlertState[]): Array<{ rule: SensorAlertRule; state: SensorAlertState }> {
  const out: Array<{ rule: SensorAlertRule; state: SensorAlertState }> = [];
  for (const state of states) {
    if (state.state !== 'active' || state.acknowledged) continue;
    const rule = rules.find(r => r.id === state.ruleId);
    if (rule && rule.enabled) out.push({ rule, state });
  }
  return out.sort((a, b) => Number(b.rule.severity === 'act') - Number(a.rule.severity === 'act'));
}
