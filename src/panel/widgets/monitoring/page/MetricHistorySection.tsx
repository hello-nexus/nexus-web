import { useMemo } from 'react';
import { TimeSeriesChart } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { TimelineBrush } from '../../../../components/common/TimelineBrush/TimelineBrush';
import { Select } from '../../../../components/common/Select/Select';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import type { GpuComponent } from '../../../../lib/gpuResolver';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import { useMetricHistory } from '../../../../hooks/useMetricHistory';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { formatRate } from './shared';
import {
  CPU_TEMP_THRESHOLD_C,
  GPU_TEMP_THRESHOLD_C,
  RANGE_OPTIONS,
  nearestTempAt,
  pickGpuHistorySeries,
  sumSilhouette,
  tempBands,
  toHistoryChartSeries,
  xTickFormatForWindow,
} from './metricHistoryHelpers';
import { TempRibbon } from './TempRibbon';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';
import styles from './MetricHistorySection.module.scss';

export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'gpu';

export interface MetricHistorySectionProps {
  metric: HistoryMetric;
  /** Consulted only for metric === 'gpu'. */
  gpuComponents: readonly GpuComponent[];
  preferredGpuId: string;
}

const CHART_HEIGHT = 220;

function seriesQueryFor(metric: HistoryMetric): string {
  switch (metric) {
    case 'cpu': return 'cpu,cpu-temp';
    case 'memory': return 'memory';
    case 'network': return 'net-in,net-out';
    case 'gpu': return 'gpu,gpu-temp';
  }
}

export function MetricHistorySection({ metric, gpuComponents, preferredGpuId }: MetricHistorySectionProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();

  const seriesQuery = seriesQueryFor(metric);
  const history = useMetricHistory(true, seriesQuery);

  const primaryGpu = metric === 'gpu' ? resolvePrimaryGpu(gpuComponents, preferredGpuId) : undefined;

  const resolved = useMemo(() => {
    if (metric === 'cpu') {
      return {
        main: history.series.filter(s => s.id === 'cpu'),
        temp: history.series.find(s => s.id === 'cpu-temp') ?? null,
        tempThresholdC: CPU_TEMP_THRESHOLD_C,
        available: true,
      };
    }
    if (metric === 'memory') {
      return { main: history.series.filter(s => s.id === 'memory'), temp: null, tempThresholdC: null, available: true };
    }
    if (metric === 'network') {
      return { main: history.series.filter(s => s.id === 'net-in' || s.id === 'net-out'), temp: null, tempThresholdC: null, available: true };
    }
    // gpu
    if (!primaryGpu) return { main: [] as MetricHistorySeries[], temp: null, tempThresholdC: GPU_TEMP_THRESHOLD_C, available: false };
    const picked = pickGpuHistorySeries(history.series, primaryGpu.adapterLuid ?? '', primaryGpu.name);
    return {
      main: picked.load ? [picked.load] : [],
      temp: picked.temp,
      tempThresholdC: GPU_TEMP_THRESHOLD_C,
      available: picked.load !== null,
    };
  }, [metric, history.series, primaryGpu]);

  const colorFor = useMemo(() => {
    if (metric === 'network') {
      return (id: string) => (id === 'net-in' ? 'var(--accent)' : 'var(--accent-deep)');
    }
    return () => 'var(--accent)';
  }, [metric]);

  const nameOverride = useMemo(() => {
    if (metric !== 'network') return null;
    return (id: string) => (id === 'net-in' ? t('monitoring.history.download') : t('monitoring.history.upload'));
  }, [metric, t]);

  const chartSeries = useMemo(() => {
    const mapped = toHistoryChartSeries(resolved.main, colorFor);
    return nameOverride ? mapped.map(s => ({ ...s, name: nameOverride(s.id) })) : mapped;
  }, [resolved.main, colorFor, nameOverride]);

  const yDomain: [number | null, number | null] = metric === 'network' ? [0, null] : [0, 100];
  const valueFormat = useMemo(() => {
    if (metric === 'network') return (v: number) => formatRate(v, numberFormat);
    return (v: number) => localizeNumbers(`${Math.round(v)}%`, numberFormat);
  }, [metric, numberFormat]);

  const windowMs = history.domain[1] - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs), [windowMs]);

  const bands = useMemo(
    () => (resolved.temp && resolved.tempThresholdC !== null ? tempBands(resolved.temp.points, resolved.tempThresholdC) : []),
    [resolved.temp, resolved.tempThresholdC],
  );

  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

  const edgeLabelFormat = (t2: number) => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const ariaValueText = (from: number, to: number) => `${edgeLabelFormat(from)} - ${edgeLabelFormat(to)}`;

  const silhouettePoints = useMemo(() => {
    if (metric === 'network') return sumSilhouette(history.silhouette);
    const s = history.silhouette.find(x => resolved.main.some(m => m.id === x.id)) ?? history.silhouette[0];
    return s?.points ?? [];
  }, [metric, history.silhouette, resolved.main]);

  const currentTempLabel = useMemo(() => {
    if (!resolved.temp) return undefined;
    const nearest = nearestTempAt(resolved.temp.points, history.domain[1], windowMs);
    if (!nearest) return undefined;
    return localizeNumbers(`${Math.round(convertTemperature(nearest.avg, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat);
  }, [resolved.temp, history.domain, windowMs, monitoringTempUnit, numberFormat]);

  if (!history.supported) return null;
  if ((metric === 'gpu') && !resolved.available && !history.loading) return null;

  const titleKey = metric === 'cpu' ? 'monitoring.tab.cpu'
    : metric === 'memory' ? 'monitoring.tab.memory'
    : metric === 'network' ? 'monitoring.tab.network'
    : 'monitoring.tab.gpu';

  const showLoadingSkeleton = history.loading && chartSeries.every(s => s.points.length === 0) && history.silhouette.length === 0;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>{t(titleKey)}</span>
        {history.following && <Badge label={t('monitoring.history.live')} color="var(--good)" />}
        {history.mocked && <Badge label={t('monitoring.history.mocked')} color="var(--warn)" />}
      </div>

      {history.error ? (
        <EmptyState
          compact
          title={t('monitoring.history.error')}
          action={<Button size="sm" onClick={history.retry}>{t('monitoring.history.retry')}</Button>}
        />
      ) : showLoadingSkeleton ? (
        <div className={styles.skeleton} style={{ height: CHART_HEIGHT }} />
      ) : (
        <>
          <TimeSeriesChart
            series={chartSeries}
            height={CHART_HEIGHT}
            domain={history.domain}
            yDomain={yDomain}
            valueFormat={valueFormat}
            xTickFormat={xTickFormat}
            avgLabel={t('monitoring.history.avg')}
            maxLabel={t('monitoring.history.max')}
            bands={bands}
            tooltipExtra={resolved.temp ? (hoverT: number) => {
              const nearest = nearestTempAt(resolved.temp!.points, hoverT, windowMs);
              if (!nearest) return null;
              return (
                <div className={styles.tooltipTemp}>
                  {t('monitoring.history.temp')} {localizeNumbers(`${Math.round(convertTemperature(nearest.avg, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat)}
                </div>
              );
            } : undefined}
          />
          {resolved.temp && resolved.tempThresholdC !== null && (
            <TempRibbon
              points={resolved.temp.points}
              domain={history.domain}
              minC={resolved.tempThresholdC - 30}
              maxC={resolved.tempThresholdC}
              currentLabel={currentTempLabel}
            />
          )}
          <div className={styles.controls}>
            <Select
              className={styles.rangeSelect}
              value={history.rangeKey}
              onChange={key => history.setRange(key as typeof history.rangeKey)}
              options={rangeOptions}
              placeholder={t('monitoring.history.range.custom')}
              ariaLabel={t('monitoring.history.rangeAriaLabel')}
            />
            <TimelineBrush
              className={styles.brush}
              domainStart={history.fullDomain[0]}
              domainEnd={history.fullDomain[1]}
              from={history.domain[0]}
              to={history.domain[1]}
              onChange={history.onBrushChange}
              silhouette={silhouettePoints.map(p => ({ t: p.t, v: p.avg }))}
              ariaLabel={t('monitoring.history.brushAriaLabel')}
              ariaValueText={ariaValueText}
              formatEdgeLabel={edgeLabelFormat}
            />
          </div>
        </>
      )}
    </div>
  );
}
