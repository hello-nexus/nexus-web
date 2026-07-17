import { useMemo } from 'react';
import { Radio, Thermometer, ZoomOut } from 'lucide-react';
import { TimeSeriesChart } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { nearestPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../../../components/common/TimelineBrush/TimelineBrush';
import { Select } from '../../../../components/common/Select/Select';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import type { GpuComponent } from '../../../../lib/gpuResolver';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import type { UseMetricHistoryResult } from '../../../../hooks/useMetricHistory';
import type { UseMetricHistoryAppsResult } from '../../../../hooks/useMetricHistoryApps';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { formatRate } from './shared';
import { ProcessIcon } from './ProcessListSection';
import { topAppsAtHover } from './appWindowHelpers';
import {
  CPU_TEMP_RIBBON_CAP_C,
  GPU_TEMP_RIBBON_CAP_C,
  RANGE_OPTIONS,
  TEMP_RIBBON_FLOOR_C,
  formatBrushEdgeLabels,
  nearestTempAt,
  pickGpuHistorySeries,
  sumSilhouette,
  toHistoryChartSeries,
  xTickFormatForWindow,
  type HistoryMetric,
} from './metricHistoryHelpers';
import { TempRibbon } from './TempRibbon';
import type { MetricHistorySeries } from '../../../../api/monitoringHistory';
import styles from './MetricHistorySection.module.scss';

export type { HistoryMetric };

export interface MetricHistorySectionProps {
  metric: HistoryMetric;
  /** Consulted only for metric === 'gpu'. */
  gpuComponents: readonly GpuComponent[];
  preferredGpuId: string;
  history: UseMetricHistoryResult;
  appsWindow: UseMetricHistoryAppsResult;
}

const CHART_HEIGHT = 220;
const TOOLTIP_APPS_LIMIT = 8;

export function MetricHistorySection({ metric, gpuComponents, preferredGpuId, history, appsWindow }: MetricHistorySectionProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();

  const primaryGpu = metric === 'gpu' ? resolvePrimaryGpu(gpuComponents, preferredGpuId) : undefined;

  const resolved = useMemo(() => {
    if (metric === 'cpu') {
      return {
        main: history.series.filter(s => s.id === 'cpu'),
        temp: history.series.find(s => s.id === 'cpu-temp') ?? null,
        available: true,
      };
    }
    if (metric === 'memory') {
      return { main: history.series.filter(s => s.id === 'memory'), temp: null, available: true };
    }
    if (metric === 'network') {
      return { main: history.series.filter(s => s.id === 'net-in' || s.id === 'net-out'), temp: null, available: true };
    }
    // gpu
    if (!primaryGpu) return { main: [] as MetricHistorySeries[], temp: null, available: false };
    const picked = pickGpuHistorySeries(history.series, primaryGpu.adapterLuid ?? '', primaryGpu.name);
    return {
      main: picked.load ? [picked.load] : [],
      temp: picked.temp,
      available: picked.load !== null,
    };
  }, [metric, history.series, primaryGpu]);

  // Accent-only: every series on the monitoring screen shares one color -
  // network's two curves disambiguate via their hover values and names,
  // not distinct hues.
  const colorFor = useMemo(() => () => 'var(--accent)', []);

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

  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

  const edgeLabelFormat = (t2: number) => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const ariaValueText = (from: number, to: number) => `${edgeLabelFormat(from)} - ${edgeLabelFormat(to)}`;

  const silhouettePoints = useMemo(() => {
    if (metric === 'network') return sumSilhouette(history.silhouette);
    const s = history.silhouette.find(x => resolved.main.some(m => m.id === x.id)) ?? history.silhouette[0];
    return s?.points ?? [];
  }, [metric, history.silhouette, resolved.main]);

  // The temperature docked on the SAME line as the tooltip's timestamp
  // header (item 30/34) - cpu/gpu only, memory/network have no temp series.
  const tooltipHeaderTemp = useMemo(() => {
    if (!resolved.temp) return null;
    return (hoverT: number) => {
      const nearest = nearestTempAt(resolved.temp!.points, hoverT, windowMs);
      if (!nearest) return null;
      const value = localizeNumbers(`${Math.round(convertTemperature(nearest.avg, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat);
      return (
        <span className={styles.tooltipHeaderTemp}>
          <Thermometer size={12} aria-hidden />
          {value}
        </span>
      );
    };
  }, [resolved.temp, windowMs, monitoringTempUnit, numberFormat]);

  // The tooltip's docked secondary row, below the header: download/upload
  // for network (disambiguating the two curves on hover), nothing otherwise
  // (temperature moved to the header row above, see tooltipHeaderTemp).
  const tooltipNetworkRow = useMemo(() => {
    if (metric !== 'network') return null;
    return (hoverT: number) => {
      const inSeries = resolved.main.find(s => s.id === 'net-in');
      const outSeries = resolved.main.find(s => s.id === 'net-out');
      const inPoint = inSeries ? nearestPoint(inSeries.points, hoverT, windowMs) : null;
      const outPoint = outSeries ? nearestPoint(outSeries.points, hoverT, windowMs) : null;
      if (!inPoint && !outPoint) return null;
      return (
        <div className={styles.tooltipTopRow}>
          <span>{t('monitoring.history.download')} {formatRate(inPoint?.avg ?? 0, numberFormat)}</span>
          <span>{t('monitoring.history.upload')} {formatRate(outPoint?.avg ?? 0, numberFormat)}</span>
        </div>
      );
    };
  }, [metric, resolved.main, windowMs, numberFormat, t]);

  const tooltipExtra = (hoverT: number) => {
    const topRow = tooltipNetworkRow?.(hoverT) ?? null;
    const apps = appsWindow.supported && appsWindow.ready ? topAppsAtHover(appsWindow.apps, hoverT, TOOLTIP_APPS_LIMIT) : [];
    if (!topRow && apps.length === 0) return null;
    return (
      <div className={styles.tooltipCustom}>
        {topRow}
        {apps.length > 0 && (
          <div className={styles.tooltipApps}>
            {apps.map(app => (
              <div key={app.name} className={styles.tooltipAppRow}>
                <ProcessIcon name={app.name} />
                <span className={styles.tooltipAppName}>{app.name}</span>
                <span className={styles.tooltipAppValue}>{valueFormat(app.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!history.supported) return null;
  if ((metric === 'gpu') && !resolved.available && !history.loading) return null;

  const showLoadingSkeleton = history.loading && chartSeries.every(s => s.points.length === 0) && history.silhouette.length === 0;

  return (
    <div className={styles.root}>
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
          <div className={styles.liveRow}>
            {history.following ? (
              <Badge label={t('monitoring.history.live')} color="var(--good)" />
            ) : (
              <button type="button" className={styles.backToLive} onClick={history.backToLive}>
                <Radio size={12} aria-hidden />
                {t('monitoring.history.backToLive')}
              </button>
            )}
          </div>
          <TimeSeriesChart
            series={chartSeries}
            height={CHART_HEIGHT}
            domain={history.domain}
            yDomain={yDomain}
            valueFormat={valueFormat}
            xTickFormat={xTickFormat}
            avgLabel={t('monitoring.history.avg')}
            maxLabel={t('monitoring.history.max')}
            showLegend={false}
            fillGradient
            hideSeriesRows
            tooltipExtra={tooltipExtra}
            tooltipHeaderExtra={tooltipHeaderTemp ?? undefined}
            onRangeSelect={history.onChartDragSelect}
            stepSeconds={history.stepSeconds}
          />
          {resolved.temp && (
            <TempRibbon
              points={resolved.temp.points}
              domain={history.domain}
              floorC={TEMP_RIBBON_FLOOR_C}
              capC={metric === 'gpu' ? GPU_TEMP_RIBBON_CAP_C : CPU_TEMP_RIBBON_CAP_C}
            />
          )}
          <div className={styles.controls}>
            {history.rangeKey === 'custom' ? (
              <button
                type="button"
                className={styles.resetRange}
                style={{ height: TIMELINE_BRUSH_DEFAULT_HEIGHT }}
                onClick={() => history.setRange(history.lastPresetKey)}
              >
                <ZoomOut size={13} aria-hidden />
                {t('monitoring.history.zoomOut')}
              </button>
            ) : (
              <Select
                className={styles.rangeSelect}
                height={TIMELINE_BRUSH_DEFAULT_HEIGHT}
                value={history.rangeKey}
                onChange={key => history.setRange(key as typeof history.lastPresetKey)}
                options={rangeOptions}
                ariaLabel={t('monitoring.history.rangeAriaLabel')}
              />
            )}
            <TimelineBrush
              className={styles.brush}
              domainStart={history.stripDomain[0]}
              domainEnd={history.stripDomain[1]}
              from={history.domain[0]}
              to={history.domain[1]}
              onChange={history.onBrushChange}
              silhouette={silhouettePoints.map(p => ({ t: p.t, v: p.avg }))}
              ariaLabel={t('monitoring.history.brushAriaLabel')}
              ariaValueText={ariaValueText}
              formatEdgeLabels={(start, end) => formatBrushEdgeLabels(start, end, language)}
            />
          </div>
        </>
      )}
    </div>
  );
}
