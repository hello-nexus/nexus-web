import { useMemo, useState, type ReactNode } from 'react';
import { Thermometer, ZoomOut } from 'lucide-react';
import { TimeSeriesChart } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import type { TimelineEvent } from '../../../../api/monitoringEvents';
import { nearestPoint } from '../../../../components/common/TimeSeriesChart/timeSeriesChartUtils';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../../../components/common/TimelineBrush/TimelineBrush';
import { Select } from '../../../../components/common/Select/Select';
import { Button } from '../../../../components/common/Button/Button';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import type { GpuComponent } from '../../../../lib/gpuResolver';
import { resolvePrimaryGpu } from '../../../../lib/gpuResolver';
import { convertTemperature, hour12OptionFor, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import { formatMemoryMb } from '../../../../lib/formatMemory';
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
  buildFpsOverlaySeries,
  buildSelectedAppSeries,
  fanNamesForRole,
  fanSeriesIdsForRole,
  findFpsSessionAt,
  formatBrushEdgeLabels,
  maskFpsPointsToSessions,
  maxAvgValue,
  nearestTempAt,
  pickGpuHistorySeries,
  sumRpmSeriesForRole,
  sumSilhouette,
  toHistoryChartSeries,
  xTickFormatForWindow,
  type FanRoleMap,
  type HistoryMetric,
} from './metricHistoryHelpers';
import type { ChartRibbonSpec } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import type { FpsRangeSession } from '../../../../api/fps';
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
  /** seriesId -> {role, name} from GET /cooling/fans (see metricHistoryHelpers'
   *  FanRoleMap) - drives the CPU/GPU tabs' role-aware RPM sum below. */
  fanRoles: FanRoleMap;
  /** The point-in-time snapshot's selected frame - defaults to the window's
   *  own right edge (real "now" while following) until the user clicks the
   *  chart. Drives the persistent selection line and the ribbon/main-series
   *  right-side value readouts. */
  selectedFrameMs: number;
  /** Fires with the clicked timestamp on a plain chart click (not a drag). */
  onGraphClick: (t: number) => void;
  /** The process list's currently-selected app (MonitoringPage's own
   *  selection state), if any - its usage for the active metric is overlaid
   *  on this chart as an extra line (see buildSelectedAppSeries). Null
   *  renders none. */
  selectedAppName: string | null;
  /** Total system RAM in MB (see deriveMemoryTotalMb) - only consulted for
   *  metric === 'memory', to rescale the selected app's MB usage onto this
   *  chart's own percent-of-RAM axis. */
  memoryTotalMb: number | null;
  /** Timeline events for the lane above the plot, already filtered to the
   *  kinds the user has left visible. Undefined (the global events toggle
   *  off) renders no lane at all; an empty array still reserves its height,
   *  so the layout does not jump as events come and go. */
  events?: readonly TimelineEvent[];
  onEventClick: (event: TimelineEvent) => void;
  /** Passed only while a frame is pinned, which is when the "+" affordance at
   *  the top of the selection line is offered. */
  onAddEventAt?: (t: number) => void;
  renderEventTooltip: (event: TimelineEvent) => ReactNode;
  /** Global toggle (settings.monitoringFpsOverlayEnabled, off by default) -
   *  gates both the overlay line and the session-range fetch that masks it. */
  fpsOverlayEnabled: boolean;
  /** Sessions overlapping the current window, for masking the fps series to
   *  actual game time and naming the hovered game in the tooltip. Empty
   *  while the overlay is off. */
  fpsSessions: readonly FpsRangeSession[];
}

// Tall enough to keep the line/area's own plot area comfortable even with
// both ribbons present (temperature + fan speed, cpu/gpu tabs).
const CHART_HEIGHT = 238;
const TOOLTIP_APPS_LIMIT = 8;
// Matches the persistent selection line's own color (TimeSeriesChart's
// selectedT) so the overlaid app line reads as the same "highlighted on top"
// treatment, distinct from --accent (the base metric line underneath it).
const SELECTED_APP_LINE_COLOR = 'var(--text)';
// Distinct from both --accent (base line) and --text (selected-app line).
const FPS_OVERLAY_LINE_COLOR = 'var(--good)';

// Stable empty instances for the non-cpu/gpu tabs' fanRole branch, so the
// dependent useMemos below don't see a new identity every render.
const EMPTY_FAN_ID_SET: ReadonlySet<string> = new Set();
const EMPTY_FAN_NAMES: readonly string[] = [];

/** Tracks the adaptive Y ceiling's freeze/settle state across a TimelineBrush
 *  drag AND the release-to-settle window right after it (see
 *  MetricHistorySection's own render body below). */
interface YCeilingFreezeState {
  dragging: boolean;
  /** True from the instant `dragging` goes false until the settled fetch for
   *  the released window has actually landed - see sawLoadingSinceRelease. */
  pendingSettle: boolean;
  /** True once `history.loading` has been observed while pendingSettle - so
   *  a later `loading: false` reads as "the fetch finished," not "no fetch
   *  has started yet." */
  sawLoadingSinceRelease: boolean;
  /** The ceiling shown while frozen (dragging or pendingSettle). */
  frozenYMax: number | null;
}

function initYCeilingFreeze(dragging: boolean, liveYMax: number | null): YCeilingFreezeState {
  return { dragging, pendingSettle: false, sawLoadingSinceRelease: false, frozenYMax: liveYMax };
}

export function MetricHistorySection({
  metric, gpuComponents, preferredGpuId, history, appsWindow, fanRoles, selectedFrameMs, onGraphClick,
  selectedAppName, memoryTotalMb, events, onEventClick, onAddEventAt, renderEventTooltip,
  fpsOverlayEnabled, fpsSessions,
}: MetricHistorySectionProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit, numberFormat, timeFormat } = useUnitPrefs();

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

  // The selected process's own usage for this tab's metric - overlaid ON TOP
  // of the base metric line(s) below (see chartSeries), not a replacement -
  // null (and so no overlay renders) whenever nothing is selected, the app
  // has no series in this window yet, or (memory only) the total isn't known
  // to rescale it onto the percent axis.
  const selectedAppSeries = useMemo(() => {
    if (!selectedAppName) return null;
    const app = appsWindow.apps.find(a => a.name === selectedAppName);
    if (!app) return null;
    return buildSelectedAppSeries(app, metric, memoryTotalMb, SELECTED_APP_LINE_COLOR);
  }, [selectedAppName, appsWindow.apps, metric, memoryTotalMb]);

  // Masked to Frames session ranges (see maskFpsPointsToSessions) - a
  // desktop app presents frames too, so the raw fps series would otherwise
  // draw between games as well. Off entirely while the overlay is disabled,
  // since fpsSessions stays empty and history.series never carries fps then.
  const maskedFpsPoints = useMemo(() => {
    if (!fpsOverlayEnabled) return [];
    const raw = history.series.find(s => s.kind === 'fps')?.points ?? [];
    return maskFpsPointsToSessions(raw, fpsSessions);
  }, [fpsOverlayEnabled, history.series, fpsSessions]);

  const fpsOverlaySeries = useMemo(
    () => buildFpsOverlaySeries(maskedFpsPoints, FPS_OVERLAY_LINE_COLOR),
    [maskedFpsPoints],
  );

  // Selecting an app appends its own line on top of the base metric line(s),
  // which stay visible underneath - the app series carries noFill (see
  // buildSelectedAppSeries) so its own gradient fill doesn't stack a second
  // translucent layer over the base line's own fill. The fps overlay is the
  // same shape, appended after so it draws on top of a selected-app line too.
  const chartSeries = useMemo(() => {
    const mapped = toHistoryChartSeries(resolved.main, colorFor);
    const base = nameOverride ? mapped.map(s => ({ ...s, name: nameOverride(s.id) })) : mapped;
    const withApp = selectedAppSeries ? [...base, selectedAppSeries] : base;
    return fpsOverlaySeries ? [...withApp, fpsOverlaySeries] : withApp;
  }, [resolved.main, colorFor, nameOverride, selectedAppSeries, fpsOverlaySeries]);

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
  // underlying data isn't flickering). It also stays frozen through the
  // release itself, until the settled fetch for the released window actually
  // lands: `series` on the very first post-release render is still the
  // drag's last panned/clipped slice, so unfreezing immediately would show
  // liveYMax off that transient (often smaller) slice for one frame, then
  // snap again once the real data replaces it. history.loading is this
  // hook's own settle signal (see useMetricHistory's fetchEpoch-triggered
  // loadViewport) - a true-then-false cycle after release confirms the
  // fetch landed. Computed during render via the "adjust state during
  // render" pattern (same as useStableRanking/MonitoringPage's
  // shouldFreezeFallback - setState called mid-render, not in an effect) so
  // the first post-release paint already uses the frozen value; an effect
  // would still be one render too late to catch it, and only applies on a
  // render React actually commits, unlike a plain ref mutation.
  const [freeze, setFreeze] = useState<YCeilingFreezeState>(() => initYCeilingFreeze(history.dragging, liveYMax));
  let nextFreeze = freeze;
  if (nextFreeze.dragging !== history.dragging) {
    nextFreeze = { ...nextFreeze, dragging: history.dragging };
    if (!history.dragging) {
      nextFreeze = { ...nextFreeze, pendingSettle: true, sawLoadingSinceRelease: false };
    }
  }
  if (nextFreeze.pendingSettle) {
    if (history.loading) {
      if (!nextFreeze.sawLoadingSinceRelease) nextFreeze = { ...nextFreeze, sawLoadingSinceRelease: true };
    } else if (nextFreeze.sawLoadingSinceRelease) {
      nextFreeze = { ...nextFreeze, pendingSettle: false };
    }
  }
  const yCeilingFrozen = history.dragging || nextFreeze.pendingSettle;
  if (!yCeilingFrozen && nextFreeze.frozenYMax !== liveYMax) {
    nextFreeze = { ...nextFreeze, frozenYMax: liveYMax };
  }
  if (nextFreeze !== freeze) setFreeze(nextFreeze);
  const yDomain: [number | null, number | null] = useMemo(
    () => [0, yCeilingFrozen ? nextFreeze.frozenYMax : liveYMax],
    [yCeilingFrozen, liveYMax, nextFreeze.frozenYMax],
  );
  const valueFormat = useMemo(() => {
    if (metric === 'network' || metric === 'storage') return (v: number) => formatRate(v, numberFormat);
    return (v: number) => localizeNumbers(`${Math.round(v)}%`, numberFormat);
  }, [metric, numberFormat]);

  // The per-app hover breakdown's own value column: memory is a byte
  // quantity per app (MB/GB), unlike the main chart's percent-of-total-RAM
  // series (see valueFormat above) - every other metric's per-app value
  // shares the main chart's own unit (percent for cpu/gpu, a rate for
  // network/storage), so this only diverges for memory.
  const appValueFormat = useMemo(
    () => (metric === 'memory' ? (v: number) => formatMemoryMb(v, numberFormat) : valueFormat),
    [metric, numberFormat, valueFormat],
  );

  const windowMs = history.domain[1] - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs, timeFormat), [windowMs, timeFormat]);

  // The temp ribbon's own right-side readout - the value at the selected
  // frame (the window's own right edge / real "now" while following, or a
  // clicked point-in-time snapshot).
  const currentTempLabel = useMemo(() => {
    if (!resolved.temp) return undefined;
    const nearest = nearestTempAt(resolved.temp.points, selectedFrameMs, windowMs);
    if (!nearest) return undefined;
    return localizeNumbers(`${Math.round(convertTemperature(nearest.avg, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat);
  }, [resolved.temp, selectedFrameMs, windowMs, monitoringTempUnit, numberFormat]);

  // cpu/gpu only - the tab's own fan role ('none' on every other tab, so
  // markedFanIds/markedFanNames below are always empty there).
  const fanRole = metric === 'cpu' ? 'cpu' : metric === 'gpu' ? 'gpu' : null;

  const markedFanIds = useMemo(
    () => (fanRole ? fanSeriesIdsForRole(fanRoles, fanRole) : EMPTY_FAN_ID_SET),
    [fanRole, fanRoles],
  );
  const markedFanNames = useMemo(
    () => (fanRole ? fanNamesForRole(fanRoles, fanRole) : EMPTY_FAN_NAMES),
    [fanRole, fanRoles],
  );

  // Every fan series (RPM) in the current window, for the fan-speed ribbon
  // below - the SUM of just the fans marked cpu/gpu in Cooling once at least
  // one is marked, else the all-fans average (averageRpmSeries). Gated the
  // same way resolved.temp is - only cpu/gpu request the fan kind (see
  // seriesQueryFor), but history.series can transiently still carry the
  // previous tab's series for one render right after a metric switch (the
  // fetch for the new tab hasn't landed yet), so this must not just rely on
  // the fetched data happening to be empty.
  const rpmPoints = useMemo(() => {
    if (!fanRole) return [];
    if (markedFanIds.size > 0) return sumRpmSeriesForRole(history.series, markedFanIds);
    return averageRpmSeries(history.series);
  }, [fanRole, markedFanIds, history.series]);

  // The fan-speed ribbon's own right-side readout, same selected-frame
  // semantics as the temp ribbon above.
  const currentRpmLabel = useMemo(() => {
    if (rpmPoints.length === 0) return undefined;
    const nearest = nearestPoint(rpmPoints, selectedFrameMs, windowMs);
    if (!nearest) return undefined;
    return localizeNumbers(`${Math.round(nearest.avg)} RPM`, numberFormat);
  }, [rpmPoints, selectedFrameMs, windowMs, numberFormat]);

  // Hover tooltip on the RPM label itself: which fans are being summed, or -
  // when none are marked - a hint to mark them in Cooling for a precise
  // per-role reading instead of the all-fans average.
  const rpmTooltip = useMemo(() => {
    if (!fanRole || rpmPoints.length === 0) return undefined;
    if (markedFanNames.length > 0) return t('monitoring.history.rpm.markedFans', { names: markedFanNames.join(', ') });
    return t(fanRole === 'cpu' ? 'monitoring.history.rpm.hintCpu' : 'monitoring.history.rpm.hintGpu');
  }, [fanRole, rpmPoints.length, markedFanNames, t]);

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
        valueLabelTooltip: rpmTooltip,
      });
    }
    return list;
  }, [resolved.temp, currentTempLabel, rpmPoints, currentRpmLabel, rpmTooltip]);

  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

  const edgeLabelFormat = (t2: number) => new Date(t2).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: hour12OptionFor(timeFormat) });
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

  // "GameName - 118 FPS" at the hovered instant - only inside a masked
  // session's own range, so hovering between games shows nothing.
  const fpsTooltipRow = (hoverT: number) => {
    if (maskedFpsPoints.length === 0) return null;
    const session = findFpsSessionAt(fpsSessions, hoverT);
    if (!session) return null;
    const nearest = nearestPoint(maskedFpsPoints, hoverT, windowMs);
    if (!nearest) return null;
    return (
      <div className={styles.tooltipTopRow}>
        <span>{t('monitoring.fpsOverlay.tooltip', { name: session.name, value: Math.round(nearest.avg) })}</span>
      </div>
    );
  };

  const tooltipExtra = (hoverT: number) => {
    const topRow = tooltipRateRow?.(hoverT) ?? null;
    const fpsRow = fpsTooltipRow(hoverT);
    const apps = appsWindow.supported && appsWindow.ready ? topAppsAtHover(appsWindow.apps, hoverT, TOOLTIP_APPS_LIMIT) : [];
    if (!topRow && !fpsRow && apps.length === 0) return null;
    return (
      <div className={styles.tooltipCustom}>
        {topRow}
        {fpsRow}
        {apps.length > 0 && (
          <div className={styles.tooltipApps}>
            {apps.map(app => (
              <div key={app.name} className={styles.tooltipAppRow}>
                <ProcessIcon name={app.name} />
                <span className={styles.tooltipAppName}>{app.name}</span>
                <span className={styles.tooltipAppValue}>{appValueFormat(app.value)}</span>
                {app.vramAvgMb != null && (
                  <span className={styles.tooltipAppVram}>{formatMemoryMb(app.vramAvgMb, numberFormat)}</span>
                )}
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
            events={events}
            onEventClick={onEventClick}
            onAddEventAt={onAddEventAt}
            renderEventTooltip={renderEventTooltip}
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
              formatEdgeLabels={(start, end) => formatBrushEdgeLabels(start, end, timeFormat, language)}
            />
          </div>
        </>
      )}
    </div>
  );
}
