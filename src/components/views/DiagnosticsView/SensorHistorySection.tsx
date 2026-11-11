import { useMemo } from 'react';
import { ChartLine, ZoomOut } from 'lucide-react';
import { TimeSeriesChart } from '../../common/TimeSeriesChart/TimeSeriesChart';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../common/TimelineBrush/TimelineBrush';
import { Select } from '../../common/Select/Select';
import { Badge } from '../../common/Badge/Badge';
import { LiveFollowControl } from '../../common/LiveFollowControl/LiveFollowControl';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { RANGE_OPTIONS, formatBrushEdgeLabels, formatSelectedFrameTime, xTickFormatForWindow } from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';
import { formatDisplayValue, ruleLabel } from './sensorAlertHelpers';
import { sensorChartThresholds, sensorYDomain, toSensorChartSeries } from './sensorHistoryHelpers';
import cooling from './CoolingHistorySection.module.scss';

const CHART_HEIGHT = 246;

interface SensorHistorySectionProps {
  history: UseMetricHistoryResult;
  /** The sensor whose recorded history is plotted. */
  rule: SensorAlertRule;
}

/**
 * The Watchlist tab's history block, composed like the Cooling tab's temperature history (header with
 * live badge, chart, range picker and seek bar) but plotting the one selected sensor in its own unit
 * with its alert limits as dashed lines. The plain wheel scrolls the page; Ctrl/Cmd+wheel or pinch zooms.
 */
export function SensorHistorySection({ history, rule }: SensorHistorySectionProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers, timeFormat, dateFormat } = useUnitPrefs();
  const type = rule.sensor.type;

  const line = useMemo(() => toSensorChartSeries(history.series, rule, tempUnit, ruleLabel(t, rule)), [history.series, rule, tempUnit, t]);
  const thresholds = useMemo(() => sensorChartThresholds(rule, tempUnit), [rule, tempUnit]);
  const yDomain = useMemo(() => sensorYDomain(line, thresholds), [line, thresholds]);

  const windowEnd = history.domain[1];
  const windowMs = windowEnd - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs, timeFormat, dateFormat), [windowMs, timeFormat, dateFormat]);
  const detachedLabel = useMemo(() => formatSelectedFrameTime(windowEnd, windowMs, timeFormat, dateFormat), [windowEnd, windowMs, timeFormat, dateFormat]);
  const valueFormat = (v: number) => formatDisplayValue(v, type, tempUnit, numberFormat, monitoringWholeNumbers);
  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

  const showLoadingSkeleton = history.loading && !line;

  return (
    <section className={cooling.root}>
      <div className={cooling.headerRow}>
        <div className={cooling.headerStatus}>
          <SectionHeader>{ruleLabel(t, rule)}</SectionHeader>
          {history.mocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
        </div>
        <LiveFollowControl following={history.following} detachedLabel={detachedLabel} onBackToLive={history.backToLive} />
      </div>

      {!history.supported ? (
        <div className={cooling.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact title={t('monitoring.history.unsupported')} />
        </div>
      ) : history.error ? (
        <div className={cooling.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState
            compact
            title={t('monitoring.history.error')}
            action={<Button size="sm" onClick={history.retry}>{t('monitoring.history.retry')}</Button>}
          />
        </div>
      ) : showLoadingSkeleton ? (
        <div className={cooling.skeleton} style={{ height: CHART_HEIGHT }} />
      ) : !line ? (
        <div className={cooling.messageBox} style={{ height: CHART_HEIGHT }}>
          <EmptyState compact icon={<ChartLine size={22} />} title={t('diagnostics.sensors.noHistory')} />
        </div>
      ) : (
        <TimeSeriesChart
          series={[line]}
          height={CHART_HEIGHT}
          domain={history.domain}
          valueFormat={valueFormat}
          xTickFormat={xTickFormat}
          avgLabel={t('diagnostics.temperature.avg')}
          maxLabel={t('diagnostics.temperature.max')}
          thresholds={thresholds}
          yDomain={yDomain}
          onRangeSelect={history.onChartDragSelect}
          onWheelZoom={history.onChartWheelZoom}
          wheelZoomNeedsModifier
          stepSeconds={history.stepSeconds}
          yAxisSide="right"
          singleValueTooltip
          showLegend={false}
        />
      )}
      <div className={cooling.controls}>
        {history.rangeKey === 'custom' ? (
          <button
            type="button"
            className={cooling.resetRange}
            style={{ height: TIMELINE_BRUSH_DEFAULT_HEIGHT }}
            onClick={() => history.setRange(history.lastPresetKey)}
          >
            <ZoomOut size={13} aria-hidden />
            {t('monitoring.history.zoomOut')}
          </button>
        ) : (
          <Select
            className={cooling.rangeSelect}
            height={TIMELINE_BRUSH_DEFAULT_HEIGHT}
            value={history.rangeKey}
            onChange={key => history.setRange(key as typeof history.lastPresetKey)}
            options={rangeOptions}
            ariaLabel={t('monitoring.history.rangeAriaLabel')}
          />
        )}
        <TimelineBrush
          className={cooling.brush}
          domainStart={history.stripDomain[0]}
          domainEnd={history.stripDomain[1]}
          from={history.domain[0]}
          to={history.domain[1]}
          onChange={history.onBrushChange}
          ariaLabel={t('monitoring.history.brushAriaLabel')}
          ariaValueText={(from, to) => `${new Date(from).toLocaleString()} - ${new Date(to).toLocaleString()}`}
          formatEdgeLabels={(start, end) => formatBrushEdgeLabels(start, end, timeFormat, dateFormat, language)}
        />
      </div>
    </section>
  );
}
