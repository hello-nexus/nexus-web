// Pure selection and chart-linking logic for the Thermals tab (ThermalsTab).
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { TimeSeriesBand, TimeSeriesPoint, TimeSeriesSeries, TimeSeriesThreshold } from '../../common/TimeSeriesChart/TimeSeriesChart';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import type { MetricHistorySeries } from '../../../api/monitoringHistory';
import { isBuiltIn } from './sensorAlertHelpers';
import { distinctLineColors } from './temperatureHelpers';

/** The unit groups the watchlist charts by; each plots its entries together on one axis. */
export type ThermalGroup = 'thermals' | 'loads' | 'voltages' | 'power' | 'fans' | 'clocks' | 'currents' | 'controls' | 'levels';

export const THERMAL_GROUP_ORDER: readonly ThermalGroup[] = ['thermals', 'loads', 'voltages', 'power', 'fans', 'clocks', 'currents', 'controls', 'levels'];

const GROUP_BY_TYPE: Record<string, ThermalGroup> = {
  Temperature: 'thermals', Load: 'loads', Voltage: 'voltages', Power: 'power', Fan: 'fans',
  Clock: 'clocks', Current: 'currents', Control: 'controls', Level: 'levels',
};

/** The group an entry charts in, by its sensor type (a built-in without a known type is a device temperature). */
export function groupOf(rule: SensorAlertRule): ThermalGroup {
  return GROUP_BY_TYPE[rule.sensor.type] ?? (isBuiltIn(rule) ? 'thermals' : 'levels');
}

/** The watchlist's sections: every group that has an entry, in chart order, each with its built-ins first then the custom entries. */
export function groupedRules(rules: readonly SensorAlertRule[]): Array<{ group: ThermalGroup; rules: SensorAlertRule[] }> {
  return THERMAL_GROUP_ORDER.flatMap(group => {
    const inGroup = rules.filter(r => groupOf(r) === group);
    const { builtIns, custom } = partitionRules(inGroup);
    return inGroup.length > 0 ? [{ group, rules: [...builtIns, ...custom] }] : [];
  });
}

/** The groups to offer: Thermals always, then every other group that has an entry. */
export function groupsPresent(rules: readonly SensorAlertRule[]): ThermalGroup[] {
  const present = new Set(rules.map(groupOf));
  return THERMAL_GROUP_ORDER.filter(g => g === 'thermals' || present.has(g));
}

/** Locale keys: the button label and the chart title for a group (Thermals keeps its existing keys). */
export function groupLabelKey(group: ThermalGroup): string {
  return group === 'thermals' ? 'diagnostics.tab.thermals' : `diagnostics.thermals.group.${group}`;
}
export function groupTitleKey(group: ThermalGroup): string {
  return group === 'thermals' ? 'diagnostics.temperature.title' : `diagnostics.thermals.history.${group}`;
}

/**
 * The chart group plus the entry picked. `auto` means nothing was chosen yet, so the group's first entry
 * stands in; once the user picks or deselects it is false and `selectedId: null` really means none.
 */
export interface ThermalsSelection {
  group: ThermalGroup;
  selectedId: string | null;
  auto: boolean;
}

export const INITIAL_THERMALS_SELECTION: ThermalsSelection = { group: 'thermals', selectedId: null, auto: true };

/** The selected entry as the settings panel shows it: none while the search filters it out of the list (the selection itself stays). */
export function visibleSelection(
  selected: SensorAlertRule | undefined,
  sections: ReadonlyArray<{ rules: readonly SensorAlertRule[] }>,
): SensorAlertRule | undefined {
  return selected && sections.some(s => s.rules.some(r => r.id === selected.id)) ? selected : undefined;
}

/** Built-in watchlist ids read `builtin:<chart series id>`. */
const BUILTIN_ID_PREFIX = 'builtin:';

export function partitionRules(rules: readonly SensorAlertRule[]): { builtIns: SensorAlertRule[]; custom: SensorAlertRule[] } {
  return {
    builtIns: rules.filter(isBuiltIn),
    custom: rules.filter(r => !isBuiltIn(r)),
  };
}

/** Picking an entry shows its group with that entry highlighted. */
export function selectRule(_sel: ThermalsSelection, rule: SensorAlertRule): ThermalsSelection {
  return { group: groupOf(rule), selectedId: rule.id, auto: false };
}

/** Clearing the pick keeps the group. */
export function deselect(sel: ThermalsSelection): ThermalsSelection {
  return { ...sel, selectedId: null, auto: false };
}

/** Switching group highlights that group's first entry. */
export function selectGroup(sel: ThermalsSelection, group: ThermalGroup): ThermalsSelection {
  return sel.group === group ? sel : { group, selectedId: null, auto: true };
}

export interface ResolvedThermals {
  group: ThermalGroup;
  groups: ThermalGroup[];
  /** The highlighted entry, or null when none is selected. */
  selectedId: string | null;
  /** Every entry of the shown group, built-ins first. */
  groupRules: SensorAlertRule[];
}

/** The effective group and selection: the picked entry's own group while it exists, else the remembered group (Thermals once it has no entries). */
export function resolveThermals(rules: readonly SensorAlertRule[], sel: ThermalsSelection): ResolvedThermals {
  const groups = groupsPresent(rules);
  const picked = rules.find(r => r.id === sel.selectedId);
  const group = picked ? groupOf(picked) : (groups.includes(sel.group) ? sel.group : 'thermals');
  const { builtIns, custom } = partitionRules(rules.filter(r => groupOf(r) === group));
  const groupRules = [...builtIns, ...custom];
  const selectedId = picked && groupOf(picked) === group ? picked.id : (sel.auto ? (groupRules[0]?.id ?? null) : null);
  return { group, groups, selectedId, groupRules };
}

/** The chart series a built-in entry draws, or null for a custom sensor. */
export function builtInSeriesId(rule: SensorAlertRule | undefined): string | null {
  if (!rule || !isBuiltIn(rule) || !rule.id.startsWith(BUILTIN_ID_PREFIX)) return null;
  return rule.id.slice(BUILTIN_ID_PREFIX.length);
}

/** The chart series an entry draws: a built-in device temperature's monitoring line, else the entry's own recorded line. */
export function seriesIdOfRule(rule: SensorAlertRule): string {
  return groupOf(rule) === 'thermals' ? (builtInSeriesId(rule) ?? rule.id) : rule.id;
}

/** The entry a chart series belongs to, or null when none tracks it. */
export function ruleForSeries(rules: readonly SensorAlertRule[], seriesId: string): SensorAlertRule | null {
  return rules.find(r => seriesIdOfRule(r) === seriesId) ?? null;
}

/** An entry's limits as chart lines in its native unit (Celsius for a temperature), the unit the group's chart plots in. */
export function ruleThresholds(rule: SensorAlertRule | undefined): TimeSeriesThreshold[] {
  if (!rule) return [];
  const color = rule.severity === 'act' ? 'var(--bad)' : 'var(--warn)';
  return [rule.low, rule.high]
    .filter((v): v is number => v !== null)
    .map(value => ({ value, color }));
}

/**
 * The stretches where a line sits outside its limits (above `high` or below `low`) as chart bands, the
 * same translucent bands the sustained-high episodes use. A run of consecutive out-of-range points spans
 * its first to last point; a lone point widens by half the gap to its neighbours so it stays visible.
 */
export function outOfRangeBands(
  points: readonly TimeSeriesPoint[],
  low: number | null,
  high: number | null,
  color: string,
): TimeSeriesBand[] {
  if (low === null && high === null) return [];
  const out = (p: TimeSeriesPoint) => (high !== null && p.avg > high) || (low !== null && p.avg < low);
  const bands: TimeSeriesBand[] = [];
  let i = 0;
  while (i < points.length) {
    if (!out(points[i])) { i++; continue; }
    let j = i;
    while (j + 1 < points.length && out(points[j + 1])) j++;
    let startT = points[i].t;
    let endT = points[j].t;
    if (i === j) {
      const before = i > 0 ? points[i].t - points[i - 1].t : null;
      const after = i + 1 < points.length ? points[i + 1].t - points[i].t : null;
      const half = Math.min(before ?? Infinity, after ?? Infinity) / 2;
      if (Number.isFinite(half)) { startT -= half; endT += half; }
    }
    bands.push({ startT, endT, color });
    i = j + 1;
  }
  return bands;
}

/** Out-of-range bands for every enabled entry whose series is drawn, each against its own limits in the chart's native unit. */
export function ruleOutOfRangeBands(
  rules: readonly SensorAlertRule[],
  series: readonly TimeSeriesSeries[],
): TimeSeriesBand[] {
  return rules.flatMap(rule => {
    const line = series.find(s => s.id === seriesIdOfRule(rule));
    if (!line || !rule.enabled) return [];
    return outOfRangeBands(line.points, rule.low, rule.high, rule.severity === 'act' ? 'var(--bad)' : 'var(--warn)');
  });
}

/** The recorded lines of `rules` (those with points), in the chart's native units, each in its own color distinct from `taken`. */
export function ruleLines(
  rules: readonly SensorAlertRule[],
  history: readonly MetricHistorySeries[],
  labelOf: (rule: SensorAlertRule) => string,
  taken?: ReadonlySet<string>,
): TimeSeriesSeries[] {
  const found = rules.flatMap(rule => {
    const s = history.find(h => h.id === rule.id);
    return s && s.points.length > 0 ? [{ rule, s }] : [];
  });
  const colors = distinctLineColors(found.length, taken);
  return found.map(({ rule, s }, i) => ({
    id: rule.id,
    name: labelOf(rule),
    color: colors[i],
    points: s.points.map(p => ({ t: p.t, avg: p.avg, max: p.max })),
  }));
}

/**
 * The Thermals chart's viewport with the custom temperatures' history following it: every navigation the
 * user makes is forwarded to `follower` too, so both fetch the same window. Reads come from `lead`.
 */
export function linkHistories(lead: UseMetricHistoryResult, follower: UseMetricHistoryResult): UseMetricHistoryResult {
  return {
    ...lead,
    setRange: key => { lead.setRange(key); follower.setRange(key); },
    onBrushChange: (from, to, phase) => { lead.onBrushChange(from, to, phase); follower.onBrushChange(from, to, phase); },
    onChartDragSelect: (from, to) => { lead.onChartDragSelect(from, to); follower.onChartDragSelect(from, to); },
    onChartWheelZoom: (anchorT, factor) => { const moved = lead.onChartWheelZoom(anchorT, factor); follower.onChartWheelZoom(anchorT, factor); return moved; },
    detach: () => { lead.detach(); follower.detach(); },
    backToLive: () => { lead.backToLive(); follower.backToLive(); },
    retry: () => { lead.retry(); follower.retry(); },
  };
}
