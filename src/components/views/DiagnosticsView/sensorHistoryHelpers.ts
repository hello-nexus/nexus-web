import type { MetricHistoryOptions } from '../../../hooks/useMetricHistory';
import type { TimeSeriesSeries, TimeSeriesThreshold } from '../../common/TimeSeriesChart/TimeSeriesChart';

/** The history source ignores the series filter; the kind token keeps the monitoring push topic's frames out of the chart. */
export const SENSOR_HISTORY_QUERY = 'sensorAlert';

/** The chart plots the whole range the picker names, so the window fills the strip. */
export const SENSOR_HISTORY_OPTIONS: MetricHistoryOptions = { fillBox: true };

/** The Watchlist tab's anchor id for a rule's list row, which Summary rows scroll to. */
export function sensorCardAnchor(ruleId: string): string {
  return `sensor-card-${ruleId}`;
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
