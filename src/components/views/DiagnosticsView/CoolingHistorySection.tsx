import { useMemo } from 'react';
import { Fan, Thermometer, ZoomOut } from 'lucide-react';
import { TimeSeriesChart, type ChartRibbonSpec } from '../../common/TimeSeriesChart/TimeSeriesChart';
import { nearestPoint } from '../../common/TimeSeriesChart/timeSeriesChartUtils';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../common/TimelineBrush/TimelineBrush';
import { Select } from '../../common/Select/Select';
import { Badge } from '../../common/Badge/Badge';
import { LiveFollowControl } from '../../common/LiveFollowControl/LiveFollowControl';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import type { DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { hour12OptionFor, localizeNumbers } from '../../../lib/units';
import {
  RANGE_OPTIONS,
  averageRpmSeries,
  formatBrushEdgeLabels,
  xTickFormatForWindow,
  formatSelectedFrameTime,
} from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';
import { episodeBand, formatTemperatureCelsius } from './temperatureHelpers';
import { coolingSilhouettePoints, toCoolingTempChartSeries } from './coolingHistoryHelpers';
import styles from './CoolingHistorySection.module.scss';

export interface CoolingHistorySectionProps {
  history: UseMetricHistoryResult;
  episodes?: readonly DiagnosticsTemperatureEpisode[];
}

const CHART_HEIGHT = 246;

/**
 * The Cooling tab's temperature history block: a scrubbable multi-line chart
 * (one line per cpu/gpu/memory/drive temperature sensor) with sustained-high-
 * temperature episodes as bands and average fan speed (RPM) as a band
 * underneath, a range picker, and a seek-bar. Sits above the GPU/fan-pump
 * split.
 */
export function CoolingHistorySection({ history, episodes }: CoolingHistorySectionProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit, numberFormat, timeFormat, dateFormat } = useUnitPrefs();

  const chartSeries = useMemo(() => toCoolingTempChartSeries(history.series), [history.series]);
  const silhouettePoints = useMemo(() => coolingSilhouettePoints(history.silhouette), [history.silhouette]);
  const rpmPoints = useMemo(() => averageRpmSeries(history.series), [history.series]);

  const windowEnd = history.domain[1];
  const windowMs = windowEnd - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs, timeFormat, dateFormat), [windowMs, timeFormat, dateFormat]);
  // No per-frame click-to-pin here (unlike the monitoring page) - detaching
  // via the seek bar leaves the viewed window's right edge as the frame of
  // record, so that is what the chip shows once following goes false.
  const detachedLabel = useMemo(() => formatSelectedFrameTime(windowEnd, windowMs, timeFormat, dateFormat), [windowEnd, windowMs, timeFormat, dateFormat]);
  const valueFormat = useMemo(
    () => (v: number) => formatTemperatureCelsius(v, monitoringTempUnit, numberFormat),
    [monitoringTempUnit, numberFormat],
  );

  const bands = useMemo(() => (episodes ?? []).map(episodeBand), [episodes]);

  // Docked on the same row as the tooltip's own timestamp header - the
  // fan-speed band has no per-series avg/max tooltip row of its own (it
  // isn't a line), so its hovered value shows here instead.
  const tooltipHeaderRpm = useMemo(() => {
    if (rpmPoints.length === 0) return null;
    return (hoverT: number) => {
      const nearest = nearestPoint(rpmPoints, hoverT, windowMs);
      if (!nearest) return null;
      return (
        <span className={styles.tooltipHeaderRpm}>
          <Fan size={12} aria-hidden />
          {localizeNumbers(`${Math.round(nearest.avg)} RPM`, numberFormat)}
        </span>
      );
    };
  }, [rpmPoints, windowMs, numberFormat]);

  const currentRpmLabel = useMemo(() => {
    if (rpmPoints.length === 0) return undefined;
    const nearest = rpmPoints[rpmPoints.length - 1];
    return localizeNumbers(`${Math.round(nearest.avg)} RPM`, numberFormat);
  }, [rpmPoints, numberFormat]);

  const ribbons: ChartRibbonSpec[] = useMemo(() => {
    if (rpmPoints.length === 0) return [];
    return [{
      points: rpmPoints,
      fill: 'var(--accent)',
      valueLabel: currentRpmLabel,
    }];
  }, [rpmPoints, currentRpmLabel]);

  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));
  const edgeLabelFormat = (edgeT: number) => new Date(edgeT).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: hour12OptionFor(timeFormat) });
  const ariaValueText = (from: number, to: number) => `${edgeLabelFormat(from)} - ${edgeLabelFormat(to)}`;

  const showUnsupported = !history.supported;
  const showLoadingSkeleton = history.loading && chartSeries.every(s => s.points.length === 0) && history.silhouette.length === 0;
  const showEmpty = !history.loading && !history.error && chartSeries.length === 0 && rpmPoints.length === 0;

  return (
    <section className={styles.root}>
      <div className={styles.headerRow}>
        <div className={styles.headerStatus}>
          <SectionHeader>{t('diagnostics.temperature.title')}</SectionHeader>
          {history.mocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
        </div>
        <LiveFollowControl following={history.following} detachedLabel={detachedLabel} onBackToLive={history.backToLive} />
      </div>

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
      ) : showLoadingSkeleton ? (
        <div className={styles.skeleton} style={{ height: CHART_HEIGHT }} />
      ) : showEmpty ? (
        <div className={styles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact icon={<Thermometer size={22} />} title={t('diagnostics.temperature.empty')} />
        </div>
      ) : (
        <>
          <TimeSeriesChart
            series={chartSeries}
            height={CHART_HEIGHT}
            domain={history.domain}
            valueFormat={valueFormat}
            xTickFormat={xTickFormat}
            avgLabel={t('diagnostics.temperature.avg')}
            maxLabel={t('diagnostics.temperature.max')}
            bands={bands}
            tooltipHeaderExtra={tooltipHeaderRpm ?? undefined}
            onRangeSelect={history.onChartDragSelect}
            onWheelZoom={history.onChartWheelZoom}
            stepSeconds={history.stepSeconds}
            yAxisSide="right"
            singleValueTooltip
            ribbons={ribbons}
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
              formatEdgeLabels={(start, end) => formatBrushEdgeLabels(start, end, timeFormat, dateFormat, language)}
            />
          </div>
        </>
      )}
    </section>
  );
}
