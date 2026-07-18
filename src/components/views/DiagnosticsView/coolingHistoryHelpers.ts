// Pure helpers for the Cooling tab's history/scrubbing chart
// (CoolingHistorySection). Kept side-effect-free (no i18n context, no fetch)
// so they're covered directly by coolingHistoryHelpers.test.ts instead of
// through component rendering. Mirrors the monitoring hero chart's own
// metricHistoryHelpers.ts.
import type { MetricHistoryKind, MetricHistorySeries } from '../../../api/monitoringHistory';
import type { TimeSeriesPoint, TimeSeriesSeries } from '../../common/TimeSeriesChart/TimeSeriesChart';
import { temperatureSeriesColor } from './temperatureHelpers';

/** The `series=` csv requested from GET /monitoring/history for this chart:
 *  every temperature kind it plots as a line, plus fan speed (RPM) for the
 *  band rendered underneath. */
export const COOLING_HISTORY_SERIES_QUERY = 'cpu-temp,gpu-temp,mem-temp,drive-temp,fan';

type CoolingTempKind = 'cpu-temp' | 'gpu-temp' | 'mem-temp' | 'drive-temp';

// Fixed legend/color-rank order, independent of the server's own array order -
// so the legend and per-kind shade ranking never reshuffle when the server
// returns kinds in a different order or a refetch changes array order.
const TEMP_KIND_ORDER: readonly CoolingTempKind[] = ['cpu-temp', 'gpu-temp', 'mem-temp', 'drive-temp'];

const TEMP_KIND_TO_DIAGNOSTICS_KIND: Record<CoolingTempKind, 'cpu' | 'gpu' | 'ram' | 'storage'> = {
  'cpu-temp': 'cpu',
  'gpu-temp': 'gpu',
  'mem-temp': 'ram',
  'drive-temp': 'storage',
};

function isCoolingTempKind(kind: MetricHistoryKind): kind is CoolingTempKind {
  return kind === 'cpu-temp' || kind === 'gpu-temp' || kind === 'mem-temp' || kind === 'drive-temp';
}

/**
 * Maps the history API's temperature-kind series onto TimeSeriesChart's
 * generic shape: filters to the temperature kinds (cpu/gpu/mem/drive),
 * dropping the fan kind (which renders as its own ribbon instead of a line),
 * sorted by kind then id so the legend/color rank is stable regardless of the
 * server's array order, and colored via temperatureHelpers.ts's fixed kind
 * palette (shade families for a second/third series of the same kind, e.g.
 * multiple drives).
 */
export function toCoolingTempChartSeries(series: readonly MetricHistorySeries[]): TimeSeriesSeries[] {
  const filtered = series.filter((s): s is MetricHistorySeries & { kind: CoolingTempKind } => isCoolingTempKind(s.kind));
  const sorted = [...filtered].sort((a, b) => {
    const byKind = TEMP_KIND_ORDER.indexOf(a.kind) - TEMP_KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : a.id.localeCompare(b.id);
  });
  const kindRank = new Map<CoolingTempKind, number>();
  return sorted.map(s => {
    const rank = kindRank.get(s.kind) ?? 0;
    kindRank.set(s.kind, rank + 1);
    return {
      id: s.id,
      name: s.name,
      color: temperatureSeriesColor(TEMP_KIND_TO_DIAGNOSTICS_KIND[s.kind], rank),
      points: s.points.map(p => ({ t: p.t, avg: p.avg, max: p.max })),
    };
  });
}

/**
 * Averages every temperature-kind series (cpu/gpu/mem/drive) into one line
 * for the TimelineBrush minimap - an average, not a sum (unlike the
 * monitoring hero chart's network silhouette), since these are independent
 * absolute temperature readings rather than additive throughput. Aligns by
 * timestamp so a momentary per-series gap doesn't misalign the average.
 */
export function coolingSilhouettePoints(series: readonly MetricHistorySeries[]): TimeSeriesPoint[] {
  const byT = new Map<number, { sum: number; count: number; max: number }>();
  for (const s of series) {
    if (!isCoolingTempKind(s.kind)) continue;
    for (const p of s.points) {
      const cur = byT.get(p.t) ?? { sum: 0, count: 0, max: -Infinity };
      byT.set(p.t, { sum: cur.sum + p.avg, count: cur.count + 1, max: Math.max(cur.max, p.max) });
    }
  }
  return [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, avg: v.sum / v.count, max: v.max }));
}
