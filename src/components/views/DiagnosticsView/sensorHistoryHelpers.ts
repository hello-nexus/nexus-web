import type { MetricHistoryOptions } from '../../../hooks/useMetricHistory';
import type { MetricHistorySeries } from '../../../api/monitoringHistory';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import type { TimeSeriesSeries, TimeSeriesThreshold } from '../../common/TimeSeriesChart/TimeSeriesChart';
import type { TempUnit } from '../../../lib/units';
import { toDisplay } from './sensorAlertHelpers';

/** The history source ignores the series filter; the kind token keeps the monitoring push topic's frames out of the chart. */
export const SENSOR_HISTORY_QUERY = 'sensorAlert';

/** Every card plots the whole range the picker names, so the chart window fills the strip. */
export const SENSOR_HISTORY_OPTIONS: MetricHistoryOptions = { fillBox: true };

/** The Sensors tab's anchor id for a rule's card, which Summary rows scroll to. */
export function sensorCardAnchor(ruleId: string): string {
  return `sensor-card-${ruleId}`;
}

/** A rule's recorded series as a chart line in the user's display unit; undefined when nothing is recorded in the window. */
export function toSensorChartSeries(
  series: readonly MetricHistorySeries[],
  rule: SensorAlertRule,
  tempUnit: TempUnit,
): TimeSeriesSeries | undefined {
  const found = series.find(s => s.id === rule.id);
  if (!found || found.points.length === 0) return undefined;
  const type = rule.sensor.type;
  return {
    id: rule.id,
    name: found.name,
    color: 'var(--accent)',
    points: found.points.map(p => ({ t: p.t, avg: toDisplay(p.avg, type, tempUnit), max: toDisplay(p.max, type, tempUnit) })),
  };
}

/** Alert limits as chart lines in the display unit, in the rule's tone. */
export function sensorChartThresholds(rule: SensorAlertRule, tempUnit: TempUnit): TimeSeriesThreshold[] {
  const color = rule.severity === 'act' ? 'var(--bad)' : 'var(--warn)';
  const type = rule.sensor.type;
  return [rule.low, rule.high]
    .filter((v): v is number => v !== null)
    .map(v => ({ value: toDisplay(v, type, tempUnit), color }));
}

const Y_PADDING_FRACTION = 0.08;

/** A y range holding the data and the limits with a little air, so a limit just outside the data still draws. */
export function sensorYDomain(
  line: TimeSeriesSeries | undefined,
  thresholds: readonly TimeSeriesThreshold[],
): [number, number] | undefined {
  const values = [...(line?.points.flatMap(p => [p.avg, p.max]) ?? []), ...thresholds.map(t => t.value)];
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * Y_PADDING_FRACTION;
  return [min - pad, max + pad];
}
