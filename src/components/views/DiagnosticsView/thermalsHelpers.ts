// Pure selection and chart-linking logic for the Thermals tab (ThermalsTab).
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { TimeSeriesThreshold } from '../../common/TimeSeriesChart/TimeSeriesChart';
import { isBuiltIn } from './sensorAlertHelpers';

export type ThermalsMode = 'all' | 'custom';

/** The chart mode plus the entry last picked in each mode, so toggling back restores it. */
export interface ThermalsSelection {
  mode: ThermalsMode;
  all: string | null;
  custom: string | null;
}

export const INITIAL_THERMALS_SELECTION: ThermalsSelection = { mode: 'all', all: null, custom: null };

/** Built-in watchlist ids read `builtin:<chart series id>`. */
const BUILTIN_ID_PREFIX = 'builtin:';

export function partitionRules(rules: readonly SensorAlertRule[]): { builtIns: SensorAlertRule[]; custom: SensorAlertRule[] } {
  return {
    builtIns: rules.filter(isBuiltIn),
    custom: rules.filter(r => !isBuiltIn(r)),
  };
}

/** Picking a built-in shows All thermals; picking a custom sensor shows Custom. */
export function selectRule(sel: ThermalsSelection, rule: SensorAlertRule): ThermalsSelection {
  return isBuiltIn(rule) ? { ...sel, mode: 'all', all: rule.id } : { ...sel, mode: 'custom', custom: rule.id };
}

export function selectMode(sel: ThermalsSelection, mode: ThermalsMode): ThermalsSelection {
  return sel.mode === mode ? sel : { ...sel, mode };
}

export interface ResolvedThermals {
  /** Custom falls back to All while there are no custom sensors. */
  mode: ThermalsMode;
  selectedId: string | null;
  builtIns: SensorAlertRule[];
  custom: SensorAlertRule[];
}

/** The effective mode and selected entry: the remembered pick while it still exists, else the first entry of that mode. */
export function resolveThermals(rules: readonly SensorAlertRule[], sel: ThermalsSelection): ResolvedThermals {
  const { builtIns, custom } = partitionRules(rules);
  const mode: ThermalsMode = sel.mode === 'custom' && custom.length > 0 ? 'custom' : 'all';
  const pool = mode === 'custom' ? custom : (builtIns.length > 0 ? builtIns : [...rules]);
  const picked = mode === 'custom' ? sel.custom : sel.all;
  const selectedId = pool.find(r => r.id === picked)?.id ?? pool[0]?.id ?? null;
  return { mode, selectedId, builtIns, custom };
}

/** The chart series a built-in entry draws, or null for a custom sensor. */
export function builtInSeriesId(rule: SensorAlertRule | undefined): string | null {
  if (!rule || !isBuiltIn(rule) || !rule.id.startsWith(BUILTIN_ID_PREFIX)) return null;
  return rule.id.slice(BUILTIN_ID_PREFIX.length);
}

/** The built-in entry a chart series belongs to, or null when none tracks it. */
export function ruleForSeries(rules: readonly SensorAlertRule[], seriesId: string): SensorAlertRule | null {
  return rules.find(r => builtInSeriesId(r) === seriesId) ?? null;
}

/** A built-in's limits as chart lines in Celsius, the unit the temperature chart plots in. */
export function builtInThresholds(rule: SensorAlertRule | undefined): TimeSeriesThreshold[] {
  if (!rule || !isBuiltIn(rule)) return [];
  const color = rule.severity === 'act' ? 'var(--bad)' : 'var(--warn)';
  return [rule.low, rule.high]
    .filter((v): v is number => v !== null)
    .map(value => ({ value, color }));
}
