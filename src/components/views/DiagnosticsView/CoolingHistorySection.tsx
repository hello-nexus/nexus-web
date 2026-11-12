import { useMemo, type ReactNode } from 'react';
import { Fan, Thermometer, ZoomOut } from 'lucide-react';
import { TimeSeriesChart, type ChartRibbonSpec, type TimeSeriesBand, type TimeSeriesSeries, type TimeSeriesThreshold } from '../../common/TimeSeriesChart/TimeSeriesChart';
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
// The chart block shares the Monitoring page's surface, range row and brush styles instead of copying them.
import chartStyles from '../../../panel/widgets/monitoring/page/MetricHistorySection.module.scss';

export interface CoolingHistorySectionProps {
  history: UseMetricHistoryResult;
  episodes?: readonly DiagnosticsTemperatureEpisode[];
  /** Rendered in the header beside the live badge (the Thermals mode toggle). */
  headerControl?: ReactNode;
  /** The highlighted line, with its limit lines in `thresholds`. */
  activeSeriesId?: string | null;
  thresholds?: readonly TimeSeriesThreshold[];
  /** Where lines leave their watchlist limits, drawn with the episode bands. */
  rangeBands?: readonly TimeSeriesBand[];
  onSeriesSelect?: (seriesId: string) => void;
  /** Header text; the temperature title when omitted. */
  title?: string;
  /** Lines drawn instead of the device temperatures (a unit group of watchlist sensors). */
  lines?: readonly TimeSeriesSeries[];
  /** Lines added after the device temperatures (custom temperature sensors). */
  extraLines?: readonly TimeSeriesSeries[];
  /** Draws the average fan speed strip under the lines; on by default. */
  fanStrip?: boolean;
  /** Formats the axis and tooltip values; Celsius shown in the unit preference when omitted. */
  valueFormat?: (value: number) => string;
  yDomain?: readonly [number | null, number | null];
  /** The empty-state text; the temperature one when omitted. */
  emptyTitle?: string;
  /** Glyph above the empty-state title; the Thermals chart's thermometer by default. */
  emptyIcon?: ReactNode;
  wheelZoomNeedsModifier?: boolean;
}

const CHART_HEIGHT = 246;

/**
 * The Cooling tab's temperature history block: a scrubbable multi-line chart
 * (one line per cpu/gpu/memory/drive temperature sensor) with sustained-high-
 * temperature episodes as bands and average fan speed (RPM) as a band
 * underneath, a range picker, and a seek-bar. Heads the Thermals tab.
 */
export function CoolingHistorySection({
  history, episodes, headerControl, activeSeriesId, thresholds, rangeBands, onSeriesSelect,
  title, lines, extraLines, fanStrip = true, valueFormat: valueFormatProp, yDomain, emptyTitle, emptyIcon, wheelZoomNeedsModifier,
}: CoolingHistorySectionProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit, numberFormat, timeFormat, dateFormat } = useUnitPrefs();

  const chartSeries = useMemo(
    () => lines ? [...lines] : [...toCoolingTempChartSeries(history.series), ...(extraLines ?? [])],
    [lines, extraLines, history.series],
  );
  const silhouettePoints = useMemo(() => coolingSilhouettePoints(history.silhouette), [history.silhouette]);
  const rpmPoints = useMemo(() => (fanStrip ? averageRpmSeries(history.series) : []), [fanStrip, history.series]);

  const windowEnd = history.domain[1];
  const windowMs = windowEnd - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs, timeFormat, dateFormat), [windowMs, timeFormat, dateFormat]);
  // No per-frame click-to-pin here (unlike the monitoring page) - detaching
  // via the seek bar leaves the viewed window's right edge as the frame of
  // record, so that is what the chip shows once following goes false.
  const detachedLabel = useMemo(() => formatSelectedFrameTime(windowEnd, windowMs, timeFormat, dateFormat), [windowEnd, windowMs, timeFormat, dateFormat]);
  const valueFormat = useMemo(
    () => valueFormatProp ?? ((v: number) => formatTemperatureCelsius(v, monitoringTempUnit, numberFormat)),
    [valueFormatProp, monitoringTempUnit, numberFormat],
  );

  const bands = useMemo(() => [...(episodes ?? []).map(episodeBand), ...(rangeBands ?? [])], [episodes, rangeBands]);

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
    <section className={chartStyles.root}>
      <div className={styles.headerRow}>
        <div className={styles.headerStatus}>
          <SectionHeader>{title ?? t('diagnostics.temperature.title')}</SectionHeader>
          {history.mocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
        </div>
        <div className={styles.headerActions}>
          {headerControl}
          <LiveFollowControl following={history.following} detachedLabel={detachedLabel} onBackToLive={history.backToLive} />
        </div>
      </div>

      {showUnsupported ? (
        <div className={chartStyles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact title={t('monitoring.history.unsupported')} />
        </div>
      ) : history.error ? (
        <div className={chartStyles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState
            compact
            title={t('monitoring.history.error')}
            action={<Button size="sm" onClick={history.retry}>{t('monitoring.history.retry')}</Button>}
          />
        </div>
      ) : showLoadingSkeleton ? (
        <div className={chartStyles.skeleton} style={{ height: CHART_HEIGHT }} />
      ) : showEmpty ? (
        <div className={chartStyles.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact icon={emptyIcon ?? <Thermometer size={22} />} title={emptyTitle ?? t('diagnostics.temperature.empty')} />
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
            thresholds={thresholds}
            activeSeriesId={activeSeriesId}
            onSeriesSelect={onSeriesSelect}
            tooltipHeaderExtra={tooltipHeaderRpm ?? undefined}
            onRangeSelect={history.onChartDragSelect}
            onWheelZoom={history.onChartWheelZoom}
            stepSeconds={history.stepSeconds}
            yAxisSide="right"
            singleValueTooltip
            ribbons={ribbons}
            yDomain={yDomain}
            wheelZoomNeedsModifier={wheelZoomNeedsModifier}
          />
          <div className={chartStyles.controls}>
            {history.rangeKey === 'custom' ? (
              <button
                type="button"
                className={chartStyles.resetRange}
                style={{ height: TIMELINE_BRUSH_DEFAULT_HEIGHT }}
                onClick={() => history.setRange(history.lastPresetKey)}
              >
                <ZoomOut size={13} aria-hidden />
                {t('monitoring.history.zoomOut')}
              </button>
            ) : (
              <Select
                className={chartStyles.rangeSelect}
                height={TIMELINE_BRUSH_DEFAULT_HEIGHT}
                value={history.rangeKey}
                onChange={key => history.setRange(key as typeof history.lastPresetKey)}
                options={rangeOptions}
                ariaLabel={t('monitoring.history.rangeAriaLabel')}
              />
            )}
            <TimelineBrush
              className={chartStyles.brush}
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
