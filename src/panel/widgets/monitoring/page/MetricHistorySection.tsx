import { useEffect, useMemo, useRef } from 'react';
import { Thermometer, ZoomOut } from 'lucide-react';
import { TimeSeriesChart } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { nearestPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../../../components/common/TimelineBrush/TimelineBrush';
import { Select } from '../../../../components/common/Select/Select';
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
import { ProcessIcon } from './ProcessIcon';
import { topAppsAtHover } from './appWindowHelpers';
import {
  RANGE_OPTIONS,
  adaptivePercentYMax,
  averageRpmSeries,
  formatBrushEdgeLabels,
  maxAvgValue,
  nearestTempAt,
  pickGpuHistorySeries,
  sumSilhouette,
  toHistoryChartSeries,
  xTickFormatForWindow,
  type HistoryMetric,
} from './metricHistoryHelpers';
import type { ChartRibbonSpec } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
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
  /** The point-in-time snapshot's selected frame - defaults to the window's
   *  own right edge (real "now" while following) until the user clicks the
   *  chart. Drives the persistent selection line and the ribbon/main-series
   *  right-side value readouts. */
  selectedFrameMs: number;
  /** Fires with the clicked timestamp on a plain chart click (not a drag). */
  onGraphClick: (t: number) => void;
}

// Tall enough to keep the line/area's own plot area comfortable even with
// both ribbons present (temperature + fan speed, cpu/gpu tabs).
const CHART_HEIGHT = 238;
const TOOLTIP_APPS_LIMIT = 8;

export function MetricHistorySection({
  metric, gpuComponents, preferredGpuId, history, appsWindow, selectedFrameMs, onGraphClick,
}: MetricHistorySectionProps) {
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
      return {
        main: history.series.filter(s => s.id === 'memory'),
        temp: history.series.find(s => s.id === 'mem-temp') ?? null,
        available: true,
      };
    }
    if (metric === 'storage') {
      return { main: history.series.filter(s => s.id === 'disk-read' || s.id === 'disk-write'), temp: null, available: true };
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
    if (metric === 'network') return (id: string) => (id === 'net-in' ? t('monitoring.history.download') : t('monitoring.history.upload'));
    if (metric === 'storage') return (id: string) => (id === 'disk-read' ? t('monitoring.history.read') : t('monitoring.history.write'));
    return null;
  }, [metric, t]);

  const chartSeries = useMemo(() => {
    const mapped = toHistoryChartSeries(resolved.main, colorFor);
    return nameOverride ? mapped.map(s => ({ ...s, name: nameOverride(s.id) })) : mapped;
  }, [resolved.main, colorFor, nameOverride]);

  // Network and storage auto-scale their own ceiling to the data ([0, null],
  // unbounded rate); the percent metrics (cpu/gpu/memory) instead adapt to
  // the currently-rendered window's own observed peak (item R5-2) rather
  // than pinning the full 0-100 range, so a mostly-idle window isn't
  // dwarfed by unused headroom - recomputed whenever the plotted series
  // itself changes (scrubbing, live ticks), and quantized to a small step
  // ladder so a tiny peak fluctuation doesn't wobble the axis.
  const liveYMax = useMemo(
    () => (metric === 'network' || metric === 'storage' ? null : adaptivePercentYMax(maxAvgValue(chartSeries))),
    [metric, chartSeries],
  );
  // The ceiling freezes for the whole of an active TimelineBrush drag: the
  // series driving liveYMax is a pan/clip of the frozen fine snapshot, whose
  // own observed peak still shifts tick to tick as the visible window moves
  // across real data (recomputing per tick wobbles the axis even though the
  // underlying data isn't flickering). Only recomputed once the drag settles.
  const stableYMaxRef = useRef(liveYMax);
  useEffect(() => {
    if (!history.dragging) stableYMaxRef.current = liveYMax;
  }, [history.dragging, liveYMax]);
  const yDomain: [number | null, number | null] = useMemo(
    () => [0, history.dragging ? stableYMaxRef.current : liveYMax],
    [history.dragging, liveYMax],
  );
  const valueFormat = useMemo(() => {
    if (metric === 'network' || metric === 'storage') return (v: number) => formatRate(v, numberFormat);
    return (v: number) => localizeNumbers(`${Math.round(v)}%`, numberFormat);
  }, [metric, numberFormat]);

  const windowMs = history.domain[1] - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs), [windowMs]);

  // The temp ribbon's own right-side readout - the value at the selected
  // frame (the window's own right edge / real "now" while following, or a
  // clicked point-in-time snapshot).
  const currentTempLabel = useMemo(() => {
    if (!resolved.temp) return undefined;
    const nearest = nearestTempAt(resolved.temp.points, selectedFrameMs, windowMs);
    if (!nearest) return undefined;
    return localizeNumbers(`${Math.round(convertTemperature(nearest.avg, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat);
  }, [resolved.temp, selectedFrameMs, windowMs, monitoringTempUnit, numberFormat]);

  // Every fan series (RPM) in the current window, averaged into one line for
  // the fan-speed ribbon below. Gated the same way resolved.temp is - only
  // cpu/gpu request the fan kind (see seriesQueryFor), but history.series can
  // transiently still carry the previous tab's series for one render right
  // after a metric switch (the fetch for the new tab hasn't landed yet), so
  // this must not just rely on the fetched data happening to be empty.
  const rpmPoints = useMemo(
    () => (metric === 'cpu' || metric === 'gpu' ? averageRpmSeries(history.series) : []),
    [metric, history.series],
  );

  // The fan-speed ribbon's own right-side readout, same selected-frame
  // semantics as the temp ribbon above.
  const currentRpmLabel = useMemo(() => {
    if (rpmPoints.length === 0) return undefined;
    const nearest = nearestPoint(rpmPoints, selectedFrameMs, windowMs);
    if (!nearest) return undefined;
    return localizeNumbers(`${Math.round(nearest.avg)} RPM`, numberFormat);
  }, [rpmPoints, selectedFrameMs, windowMs, numberFormat]);

  // Rendered inside the chart's own plot, directly under the line (and,
  // when both are present, the fan-speed band sits directly under the temp
  // band) - see TimeSeriesChart's ribbons prop. Temp covers cpu/gpu/memory;
  // fan speed covers cpu/gpu only - network requests neither series, so the
  // chart renders no bands there.
  const ribbons: ChartRibbonSpec[] = useMemo(() => {
    const list: ChartRibbonSpec[] = [];
    if (resolved.temp) {
      list.push({
        points: resolved.temp.points,
        fill: 'var(--accent)',
        valueLabel: currentTempLabel,
      });
    }
    if (rpmPoints.length > 0) {
      list.push({
        points: rpmPoints,
        fill: 'var(--accent)',
        valueLabel: currentRpmLabel,
      });
    }
    return list;
  }, [resolved.temp, currentTempLabel, rpmPoints, currentRpmLabel]);

  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

  const edgeLabelFormat = (t2: number) => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const ariaValueText = (from: number, to: number) => `${edgeLabelFormat(from)} - ${edgeLabelFormat(to)}`;

  const silhouettePoints = useMemo(() => {
    if (metric === 'network' || metric === 'storage') return sumSilhouette(history.silhouette);
    const s = history.silhouette.find(x => resolved.main.some(m => m.id === x.id)) ?? history.silhouette[0];
    return s?.points ?? [];
  }, [metric, history.silhouette, resolved.main]);

  // The temperature docked on the SAME line as the tooltip's timestamp
  // header (item 30/34) - cpu/gpu/memory only, network has no temp series.
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
  // for network, read/write for storage (disambiguating each tab's two
  // curves on hover), nothing otherwise (temperature moved to the header row
  // above, see tooltipHeaderTemp).
  const tooltipRateRow = useMemo(() => {
    if (metric !== 'network' && metric !== 'storage') return null;
    const [idA, idB] = metric === 'network' ? ['net-in', 'net-out'] : ['disk-read', 'disk-write'];
    const labelA = t(metric === 'network' ? 'monitoring.history.download' : 'monitoring.history.read');
    const labelB = t(metric === 'network' ? 'monitoring.history.upload' : 'monitoring.history.write');
    return (hoverT: number) => {
      const aSeries = resolved.main.find(s => s.id === idA);
      const bSeries = resolved.main.find(s => s.id === idB);
      const aPoint = aSeries ? nearestPoint(aSeries.points, hoverT, windowMs) : null;
      const bPoint = bSeries ? nearestPoint(bSeries.points, hoverT, windowMs) : null;
      if (!aPoint && !bPoint) return null;
      return (
        <div className={styles.tooltipTopRow}>
          <span>{labelA} {formatRate(aPoint?.avg ?? 0, numberFormat)}</span>
          <span>{labelB} {formatRate(bPoint?.avg ?? 0, numberFormat)}</span>
        </div>
      );
    };
  }, [metric, resolved.main, windowMs, numberFormat, t]);

  const tooltipExtra = (hoverT: number) => {
    const topRow = tooltipRateRow?.(hoverT) ?? null;
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

  const showUnsupported = !history.supported;
  const showGpuUnavailable = metric === 'gpu' && !resolved.available && !history.loading;
  const showLoadingSkeleton = history.loading && chartSeries.every(s => s.points.length === 0) && history.silhouette.length === 0;

  return (
    <div className={styles.root}>
      {showUnsupported ? (
        <div className={styles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact title={t('monitoring.history.unsupported')} />
        </div>
      ) : history.error ? (
        <div className={styles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState
            compact
            title={t('monitoring.history.error')}
            action={<Button size="sm" onClick={history.retry}>{t('monitoring.history.retry')}</Button>}
          />
        </div>
      ) : showGpuUnavailable ? (
        <div className={styles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact title={t('monitoring.history.gpuUnavailable')} />
        </div>
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
            showLegend={false}
            fillGradient
            hideSeriesRows
            tooltipExtra={tooltipExtra}
            tooltipHeaderExtra={tooltipHeaderTemp ?? undefined}
            onRangeSelect={history.onChartDragSelect}
            stepSeconds={history.stepSeconds}
            yAxisSide="right"
            ribbons={ribbons}
            selectedT={selectedFrameMs}
            onPointClick={onGraphClick}
          />
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
