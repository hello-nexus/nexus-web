import { useCallback, useMemo, useState } from 'react';
import { Cpu, Gpu, MemoryStick, Network, List, Radio } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useNetworkMonitor, useAllNetworkSeries } from '../../../hooks/useNetworkMonitor';
import { useAllProcesses, useGpuProcessFeed, useGpuProcessData } from '../../../hooks/useProcessMonitor';
import { useSensors } from '../../../hooks/useSensors';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useMetricHistory } from '../../../hooks/useMetricHistory';
import { useMetricHistoryApps } from '../../../hooks/useMetricHistoryApps';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings, useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolvePrimaryGpu } from '../../../lib/gpuResolver';
import { formatMemoryMb } from '../../../lib/formatMemory';
import { localizeNumbers } from '../../../lib/units';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Badge } from '../../../components/common/Badge/Badge';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { MonitoringSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DetailedTab } from './page/DetailedTab';
import { MetricHistorySection } from './page/MetricHistorySection';
import { ProcessListSection, type ProcessListItem } from './page/ProcessListSection';
import { MonitoringSettingsModal } from './page/MonitoringSettingsModal';
import { seriesQueryFor, appsSeriesParamFor, resolveSelectedFrame, type HistoryMetric } from './page/metricHistoryHelpers';
import { appsToProcessListItems, currentAppValueMap, reconcileLiveWithWindow, zeroedGpuFallback } from './page/appWindowHelpers';
import { buildLiveUsageByName } from './page/processDetailHelpers';
import { formatRate } from './page/shared';
import { formatTabChipValue, TAB_CHIP_PERCENT_MIN_WIDTH, TAB_CHIP_RATE_MIN_WIDTH } from './page/tabChipValue';
import { usePageSettingsAction } from '../../../app/PageChrome';
import { useSensorHistoryFeed } from '../common/useSharedSensorHistory';
import styles from './MonitoringPage.module.scss';

type MonitoringTab = HistoryMetric | 'detailed';

interface MonitoringViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function MonitoringPage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const { t } = useTranslation();
  // Uncapped - the complete running-process list (item 48), not a top-N
  // dashboard-tile shape. useProcessMonitor/useNetworkMonitor's own capped
  // series stay in use by the other small tiles (MonitoringWidget etc.).
  const { cpuSeries: allCpuSeries, memSeries: allMemSeries } = useAllProcesses();
  const network = useNetworkMonitor();
  const allNetSeries = useAllNetworkSeries();
  const sensors = useSensors(serviceOnline);
  const { specs } = useSystemSpecs(serviceOnline);
  const { settings } = useUiSettings();
  const { numberFormat } = useUnitPrefs();

  // GPU surfaces appear only where the platform reports live GPU utilization
  // (Windows via LHM, NVIDIA-Linux via nvidia-smi). macOS and AMD/Intel-Linux
  // expose no GPU load, so the tab would be dead.
  const gpuSupported = sensors.gpu.some(
    s => s.type === 'Load' && (s.name === 'GPU Core' || s.name.startsWith('D3D')),
  );

  const primaryGpu = resolvePrimaryGpu(sensors.gpuComponents, settings.preferredGpuId);

  // Subscribe at page level (not per-tab) so per-process GPU history keeps
  // collecting across tab switches, the same as the always-on CPU/memory feeds.
  useGpuProcessFeed(gpuSupported);
  const { procSeries: gpuProcSeries, procMemSeries: gpuProcMemSeries } = useGpuProcessData(primaryGpu?.adapterLuid ?? '');

  // Sample the headline CPU/memory/network sparklines at page level so they
  // keep filling across tab switches; each tab's chart reads the same buffer.
  const cpuTotal = sensors.cpu.find(s => s.name === 'CPU Total')?.value ?? 0;
  const memUsed = sensors.memory.find(s => s.name === 'Memory Used');
  useSensorHistoryFeed('cpu::CPU Total', cpuTotal);
  useSensorHistoryFeed('memory::Memory Used MB', memUsed ? memUsed.value * 1024 : 0);
  useSensorHistoryFeed('network::Network Total KBs', network.totalRate / 1024);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  // Top-bar settings gear opens the GPU picker modal; register only when there
  // is more than one GPU to choose from (same modal the "Change" title-row
  // link opens).
  usePageSettingsAction(
    { onOpen: openSettings, label: t('monitoring.settings.open') },
    serviceOnline && sensors.gpuComponents.length > 1,
  );

  // Each metric tab's own live value, moved off the chart's right axis (the
  // sibling per-tab chart rework removes that readout) and into a
  // fixed-width chip on the tab button itself, so the number ticking doesn't
  // shift the tab bar. aria-hidden on the chip keeps the tab's accessible
  // name the plain label text - a value re-announcing every tick would be
  // noisy for screen-reader users, same reasoning as the tab icon's own
  // aria-hidden.
  const tabLabelWithChip = (text: string, metric: HistoryMetric, minWidth: string) => (
    <span className={styles.tabLabelWithChip}>
      {text}
      <span aria-hidden="true">
        <Badge label={formatTabChipValue(metric, sensors.cpu, sensors.gpu, sensors.memory, network.totalRate, numberFormat)} minWidth={minWidth} />
      </span>
    </span>
  );

  const tabs = ([
    { key: 'cpu', label: tabLabelWithChip(t('monitoring.tab.cpu'), 'cpu', TAB_CHIP_PERCENT_MIN_WIDTH), icon: <Cpu size={14} /> },
    { key: 'gpu', label: tabLabelWithChip(t('monitoring.tab.gpu'), 'gpu', TAB_CHIP_PERCENT_MIN_WIDTH), icon: <Gpu size={14} /> },
    { key: 'memory', label: tabLabelWithChip(t('monitoring.tab.memory'), 'memory', TAB_CHIP_PERCENT_MIN_WIDTH), icon: <MemoryStick size={14} /> },
    { key: 'network', label: tabLabelWithChip(t('monitoring.tab.network'), 'network', TAB_CHIP_RATE_MIN_WIDTH), icon: <Network size={14} /> },
    { key: 'detailed', label: t('monitoring.tab.detailed'), icon: <List size={14} /> },
  ] as const).filter(tb => tb.key !== 'gpu' || gpuSupported);

  // An unrecognized or legacy tab (e.g. the removed 'overview') renders the
  // default without rewriting the URL - render-only, matching the existing
  // "keep invalid url tabs render-only" contract.
  const tab: MonitoringTab = urlTab && tabs.some(tb => tb.key === urlTab)
    ? urlTab as MonitoringTab : 'cpu';

  const isMetricTab = tab !== 'detailed';
  const seriesQuery = isMetricTab ? seriesQueryFor(tab) : '';
  const history = useMetricHistory(isMetricTab, seriesQuery);

  const appsSeriesParam = isMetricTab ? appsSeriesParamFor(tab) : '';
  const appsWindow = useMetricHistoryApps(isMetricTab && appsSeriesParam !== '', appsSeriesParam, history.domain[0], history.domain[1], history.following);

  // Point-in-time snapshot (a click on the hero chart) - see
  // resolveSelectedFrame for the unified live/scrubbed/pinned semantics.
  const [clickedFrameMs, setClickedFrameMs] = useState<number | null>(null);
  const { selectedFrameMs, isPinned: isSnapshotPinned } = resolveSelectedFrame(clickedFrameMs, history.domain);
  const clearSnapshot = useCallback(() => setClickedFrameMs(null), []);
  const { backToLive } = history;
  const backToLiveAndClearSnapshot = useCallback(() => {
    setClickedFrameMs(null);
    backToLive();
  }, [backToLive]);

  const gpuVramByName = useMemo(() => new Map(gpuProcMemSeries.map(s => [s.name, s.current])), [gpuProcMemSeries]);

  // Independent of the active tab - the process-detail slideout's live usage
  // tiles show CPU/memory/GPU/VRAM together regardless of which metric the
  // list itself is currently ranked by.
  const liveUsageByName = useMemo(
    () => buildLiveUsageByName(allCpuSeries, allMemSeries, gpuProcSeries, gpuProcMemSeries),
    [allCpuSeries, allMemSeries, gpuProcSeries, gpuProcMemSeries],
  );

  // The complete running-process list for the active tab (item 48) - sourced
  // from the live monitoring frame (uncapped), not the window-scoped apps
  // endpoint's own top-N-by-usage response. Used directly whenever the apps
  // window isn't available/ready yet, and reconciled against the apps
  // window's own values below when both are.
  const liveItems: ProcessListItem[] = useMemo(() => {
    const toItem = (
      s: {
        name: string; current: number; values: number[]; startedAtMs?: number;
        isApp?: boolean; publisher?: string | null; signed?: 'signed' | 'unsigned' | 'unknown';
      },
      secondary?: string,
    ): ProcessListItem => ({
      name: s.name, current: s.current, values: s.values, secondary, startedAtMs: s.startedAtMs,
      isApp: s.isApp, publisher: s.publisher, signed: s.signed,
    });
    switch (tab) {
      case 'cpu': return allCpuSeries.map(s => toItem(s));
      case 'memory': return allMemSeries.map(s => toItem(s));
      case 'network': return allNetSeries.map(s => toItem(s));
      case 'gpu': {
        if (gpuProcSeries.length > 0) {
          return gpuProcSeries.map(s => {
            const vram = gpuVramByName.get(s.name) ?? 0;
            return toItem(s, vram >= 1 ? formatMemoryMb(vram, numberFormat) : undefined);
          });
        }
        // The live gpu-processes topic has nothing THIS tick - not enough on
        // its own to conclude the adapter has no per-process GPU telemetry
        // at all, since its first frame may simply not have arrived yet.
        // Corroborate with the apps window (a whole retention window's worth
        // of history, not one live tick): only fall back to the general
        // running-process list with GPU usage zeroed (item 51) once the
        // window has also come back empty, or the endpoint doesn't exist at
        // all (an older service, nothing to wait for) - otherwise stay empty
        // here so a real machine doesn't flash the fallback while its first
        // live frame is still in flight (processItems below still shows the
        // window's own real data as soon as it lands regardless).
        const windowConfirmsEmpty = !appsWindow.supported || (appsWindow.ready && appsWindow.apps.length === 0);
        if (!windowConfirmsEmpty) return [];
        return zeroedGpuFallback(allCpuSeries.map(s => toItem(s)));
      }
      default: return [];
    }
  }, [tab, allCpuSeries, allMemSeries, allNetSeries, gpuProcSeries, gpuVramByName, numberFormat, appsWindow.supported, appsWindow.ready, appsWindow.apps]);

  // Derived once per response identity, not per render: the reconciliation/
  // mapping below are pure O(apps) transforms (avg/max/points already
  // computed server-side), re-run only when a fresh apps response (or the
  // live list) actually lands - never on every render/tick.
  const usingAppsWindow = appsWindow.supported && appsWindow.ready;

  // The live list has no concept of "the scrubbed window's own values" - it
  // always reports right-now. So detaching from live must FREEZE it as a
  // snapshot instead of letting the rows keep ticking as if they tracked the
  // (unrelated) scrubbed window. Only reachable while the apps window itself
  // is unavailable - once it's available the window-scoped values already
  // ARE the scrubbed window's own truth (see processItems below). Follows
  // the "adjust state during render" pattern (react.dev/reference/react/
  // useState#storing-information-from-previous-renders), same as
  // useStableRanking, so the freeze/unfreeze takes effect in THIS render -
  // no one-tick lag showing live values after detaching.
  const shouldFreezeFallback = !usingAppsWindow && !history.following;
  const [frozenFallback, setFrozenFallback] = useState<{ tab: MonitoringTab; items: ProcessListItem[] } | null>(null);
  if (!shouldFreezeFallback) {
    if (frozenFallback !== null) setFrozenFallback(null);
  } else if (!frozenFallback || frozenFallback.tab !== tab) {
    setFrozenFallback({ tab, items: liveItems });
  }

  const processItems = useMemo(() => {
    if (usingAppsWindow) {
      // Following live: reconcile the window's top-N-by-usage response onto
      // the complete live list (item 48) so every running process shows, not
      // just the ones the window happened to record. Detached/scrubbed: the
      // window response IS the recorded historical breakdown for that past
      // window - shown as-is (necessarily just the recorded set).
      const base = history.following
        ? reconcileLiveWithWindow(liveItems, appsWindow.apps)
        : appsToProcessListItems(appsWindow.apps, liveItems);
      // Point-in-time snapshot: the % VALUE column shows each app's value AT
      // the selected frame (client-side, from the already-fetched window
      // series) instead of the window average base built above - the mini
      // sparklines (values) are untouched, still the full window.
      const snapshotValues = currentAppValueMap(appsWindow.apps, selectedFrameMs);
      return base.map(item => {
        const v = snapshotValues.get(item.name);
        return v === undefined ? item : { ...item, current: v };
      });
    }
    if (shouldFreezeFallback && frozenFallback && frozenFallback.tab === tab) return frozenFallback.items;
    return liveItems;
  }, [usingAppsWindow, history.following, liveItems, appsWindow.apps, shouldFreezeFallback, frozenFallback, tab, selectedFrameMs]);

  // Full re-rank trigger for ProcessListSection's stable ordering: the
  // active metric, whether the list is currently apps-window- or
  // fallback-sourced, and a real (non-tick) viewport change - NOT a live
  // tick slide or a routine periodic refresh of the same window, both of
  // which the ranking's own grace/stability handling already absorbs
  // without visibly reordering rows.
  const rankResetKey = `${tab}:${usingAppsWindow ? 'apps' : 'fallback'}:${history.viewportGeneration}`;

  const formatValue = useMemo(() => {
    switch (tab) {
      case 'memory': return (v: number) => formatMemoryMb(v, numberFormat);
      case 'network': return (v: number) => formatRate(v, numberFormat);
      default: return (v: number) => localizeNumbers(`${Math.round(v)}%`, numberFormat);
    }
  }, [tab, numberFormat]);

  // The hardware name moves here from the removed per-tab sensor blocks:
  // CPU/GPU/Memory show their resolved identity string; Network has no
  // comparable hardware identity and shows its plain tab name instead, at
  // the same size/style, so all four tabs' first element lines up.
  const titleText = tab === 'cpu' ? sensors.cpuModel
    : tab === 'gpu' ? (primaryGpu?.name ?? '')
    : tab === 'memory' ? (specs?.memory ?? '')
    : tab === 'network' ? t('monitoring.tab.network')
    : '';

  if (!serviceOnline) {
    return (
      <div className={styles.monitoring}>
        <ViewHeader title={t('nav.monitoring')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<MonitoringSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.monitoring}>
      <MonitoringSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        gpus={sensors.gpuComponents}
      />
      <ViewHeader
        title={t('nav.monitoring')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTabChange}
      />
      <div className={`${styles.tabContent} pageBodyFill`}>
        {tab === 'detailed' ? (
          <DetailedTab sensors={sensors} />
        ) : (
          <>
            {titleText && (
              <div className={styles.tabHeader}>
                <span className={styles.tabHeaderName}>{titleText}</span>
                {tab === 'gpu' && sensors.gpuComponents.length > 1 && (
                  <button type="button" className={styles.tabHeaderChange} onClick={openSettings}>
                    {t('monitoring.gpu.change')}
                  </button>
                )}
                {history.mocked && <Badge label={t('monitoring.history.mocked')} color="var(--warn)" />}
                <div className={styles.liveControl}>
                  <span
                    className={`${styles.liveControlSlot} ${history.following ? '' : styles.liveControlHidden}`}
                    aria-hidden={!history.following}
                  >
                    <Badge label={t('monitoring.history.live')} color="var(--good)" />
                  </span>
                  <button
                    type="button"
                    className={`${styles.backToLive} ${styles.liveControlSlot} ${history.following ? styles.liveControlHidden : ''}`}
                    onClick={backToLiveAndClearSnapshot}
                    tabIndex={history.following ? -1 : 0}
                    aria-hidden={history.following}
                  >
                    <Radio size={12} aria-hidden />
                    {t('monitoring.history.backToLive')}
                  </button>
                </div>
              </div>
            )}
            <MetricHistorySection
              metric={tab}
              gpuComponents={sensors.gpuComponents}
              preferredGpuId={settings.preferredGpuId}
              history={history}
              appsWindow={appsWindow}
              selectedFrameMs={selectedFrameMs}
              onGraphClick={setClickedFrameMs}
            />
            <div className={styles.listScroll}>
              <ProcessListSection
                items={processItems}
                formatValue={formatValue}
                rankResetKey={rankResetKey}
                frozen={shouldFreezeFallback}
                liveUsage={liveUsageByName}
                appsWindow={appsWindow}
                snapshotAtMs={isSnapshotPinned ? selectedFrameMs : null}
                onClearSnapshot={clearSnapshot}
                selectedFrameMs={selectedFrameMs}
                following={history.following}
                historyFrom={history.domain[0]}
                historyTo={history.domain[1]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
