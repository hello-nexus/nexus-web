import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Cpu, Gpu, MemoryStick, HardDrive, Network, History, List, CalendarClock } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useNetworkMonitor, useAllNetworkSeries } from '../../../hooks/useNetworkMonitor';
import { useAllProcesses, useGpuProcessFeed, useGpuProcessData } from '../../../hooks/useProcessMonitor';
import { useSensors } from '../../../hooks/useSensors';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
import { useMetricHistory } from '../../../hooks/useMetricHistory';
import { useMetricHistoryApps } from '../../../hooks/useMetricHistoryApps';
import { useDiskIoRate } from '../../../hooks/useDiskIoRate';
import { useMonitoringPrivacy } from '../../../hooks/useMonitoringPrivacy';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings, useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolvePrimaryGpu } from '../../../lib/gpuResolver';
import { formatMemoryMb } from '../../../lib/formatMemory';
import { localizeNumbers } from '../../../lib/units';
import { fetchFanChannels, type FanRole } from '../../../api/cooling';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { LiveFollowControl } from '../../../components/common/LiveFollowControl/LiveFollowControl';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { MonitoringSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DetailedTab } from './page/DetailedTab';
import { MetricHistorySection } from './page/MetricHistorySection';
import { ProcessListSection, type ProcessListItem } from './page/ProcessListSection';
import { ProcessDetailPanel } from './page/ProcessDetailPanel';
import { MonitoringSettingsModal } from './page/MonitoringSettingsModal';
import { PrivacyHistoryModal } from './page/PrivacyHistoryModal';
import { MonitoringEventsModal } from './page/MonitoringEventsModal';
import { useEventKindVisibility } from './page/useEventKindVisibility';
import { eventTooltipText } from './page/monitoringEventLabels';
import { useMonitoringEvents } from '../../../hooks/useMonitoringEvents';
import { createCustomEvent, deleteCustomEvent, type TimelineEvent } from '../../../api/monitoringEvents';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { PromptModal } from '../../../components/common/PromptModal/PromptModal';
import { seriesQueryFor, appsSeriesParamFor, currentDiskRateBytesPerSec, deriveMemoryTotalMb, resolveSelectedFrame, formatSelectedFrameTime, type FanRoleMap, type HistoryMetric } from './page/metricHistoryHelpers';
import { appsToProcessListItems, currentAppValueMap, reconcileLiveWithWindow, zeroedGpuFallback } from './page/appWindowHelpers';
import { buildLiveUsageByName } from './page/processDetailHelpers';
import { formatRate } from './page/shared';
import { formatTabChipValue, tabChipLoadPercent, TAB_CHIP_PERCENT_MIN_WIDTH, TAB_CHIP_RATE_MIN_WIDTH, ROW_VALUE_RATE_MIN_WIDTH } from './page/tabChipValue';
import { usePageSettingsAction } from '../../../app/PageChrome';
import { useSensorHistoryFeed } from '../common/useSharedSensorHistory';
import styles from './MonitoringPage.module.scss';

type MonitoringTab = HistoryMetric | 'detailed';

interface MonitoringTabDef {
  key: MonitoringTab;
  icon: ReactNode;
  labelKey: string;
  /** Omitted for 'detailed', which has no live chip - metric and minWidth
   *  are one field so a tab can't define one without the other. */
  chip?: { metric: HistoryMetric; minWidth: string };
}

// The single source of truth for every monitoring tab - key, icon, label,
// and chip config all live here in display order, so tab validity (isValidTab
// below) and the rendered tab bar (tabs, built once history/storageBytesPerSec
// are available) can never disagree about which tabs exist.
const TAB_DEFS: readonly MonitoringTabDef[] = [
  { key: 'cpu', icon: <Cpu size={14} />, labelKey: 'monitoring.tab.cpu', chip: { metric: 'cpu', minWidth: TAB_CHIP_PERCENT_MIN_WIDTH } },
  { key: 'gpu', icon: <Gpu size={14} />, labelKey: 'monitoring.tab.gpu', chip: { metric: 'gpu', minWidth: TAB_CHIP_PERCENT_MIN_WIDTH } },
  { key: 'memory', icon: <MemoryStick size={14} />, labelKey: 'monitoring.tab.memory', chip: { metric: 'memory', minWidth: TAB_CHIP_PERCENT_MIN_WIDTH } },
  { key: 'storage', icon: <HardDrive size={14} />, labelKey: 'monitoring.tab.storage', chip: { metric: 'storage', minWidth: TAB_CHIP_RATE_MIN_WIDTH } },
  { key: 'network', icon: <Network size={14} />, labelKey: 'monitoring.tab.network', chip: { metric: 'network', minWidth: TAB_CHIP_RATE_MIN_WIDTH } },
  { key: 'detailed', icon: <List size={14} />, labelKey: 'monitoring.tab.detailed' },
];

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
  const { settings, update } = useUiSettings();
  const { numberFormat } = useUnitPrefs();

  // Sourced once here (not inside ProcessListSection) since the selected
  // process's own detail panel needs the same sessions/support - a second
  // independent poll would double the request cadence for no benefit.
  const privacy = useMonitoringPrivacy(serviceOnline);
  const showPrivacy = privacy.supported && !privacy.error;
  const [privacyHistoryOpen, setPrivacyHistoryOpen] = useState(false);

  // The selected process persists across a metric-tab switch (only the
  // sidebar's own content and the graph's overlay line reflect the newly
  // active metric) - cleared via the panel's own close button, clicking its
  // already-selected row again (a toggle - closes the sidebar and clears the
  // chart overlay/row highlight exactly like the close button), or selecting
  // a different row.
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const handleSelectProcess = useCallback((name: string) => {
    setSelectedProcess(prev => (prev === name ? null : name));
  }, []);
  const handleCloseProcessDetail = useCallback(() => setSelectedProcess(null), []);

  // GPU surfaces appear only where the platform reports live GPU utilization
  // (Windows via LHM, macOS via IOAccelerator's "GPU Core" sensor,
  // NVIDIA-Linux via nvidia-smi). AMD/Intel-Linux expose no GPU load, so the
  // tab would be dead there.
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

  // Total system RAM in MB - no sensor reports it directly (see
  // deriveMemoryTotalMb) - feeds MetricHistorySection's memory-tab app-line
  // scaling (a selected app's per-process memory arrives in MB, the memory
  // tab's own line is percent-of-RAM).
  const memoryTotalMb = deriveMemoryTotalMb(memUsed?.value, tabChipLoadPercent('memory', sensors.cpu, sensors.gpu, sensors.memory));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  // Top-bar settings gear opens the GPU picker modal; register only when there
  // is more than one GPU to choose from (same modal the "Change" title-row
  // link opens).
  // Always registered: the dialog carries the timeline event toggles, which
  // are worth opening for on any machine, not just a multi-GPU one.
  usePageSettingsAction(
    { onOpen: openSettings, label: t('monitoring.settings.open') },
    serviceOnline,
  );

  // An unrecognized or legacy tab (e.g. the removed 'overview') renders the
  // default without rewriting the URL - render-only, matching the existing
  // "keep invalid url tabs render-only" contract. Checked against TAB_DEFS -
  // the same source the labeled `tabs` array below draws from - resolved
  // here (rather than against that array) so `tab` and the `history` it
  // drives are available before `tabs` itself, which needs `history`'s own
  // storage chip value.
  const isValidTab = (key: string): key is MonitoringTab =>
    TAB_DEFS.some(d => d.key === key) && (key !== 'gpu' || gpuSupported);
  const tab: MonitoringTab = urlTab && isValidTab(urlTab) ? urlTab : 'cpu';

  // Fan role config (see FanRoleMap) drives the CPU/GPU tabs' role-aware RPM
  // sum in MetricHistorySection. Roles are slow-changing config, not a live
  // feed, so this is a plain fetch rather than a poll: once on mount (whatever
  // tab loads first), and again each time the active tab becomes cpu/gpu -
  // catches a role marked on the Cooling page since the last fetch. A failed
  // fetch just leaves the previous (possibly empty) map in place, which reads
  // as "nothing marked" and falls back to the all-fans average.
  const [fanRoles, setFanRoles] = useState<FanRoleMap>(() => new Map());
  const fanRolesMountedRef = useRef(true);
  const fanRolesSeqRef = useRef(0);
  const fanRolesFetchedRef = useRef(false);
  useEffect(() => {
    fanRolesMountedRef.current = true;
    return () => { fanRolesMountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (tab !== 'cpu' && tab !== 'gpu' && fanRolesFetchedRef.current) return;
    fanRolesFetchedRef.current = true;
    const seq = ++fanRolesSeqRef.current;
    void (async () => {
      const result = await fetchFanChannels();
      if (!fanRolesMountedRef.current || seq !== fanRolesSeqRef.current || !result) return;
      const map = new Map<string, { role: FanRole; name: string }>();
      for (const ch of result.channels) {
        if (ch.seriesId) map.set(`fan:${ch.seriesId}`, { role: ch.role ?? 'none', name: ch.name });
      }
      setFanRoles(map);
    })();
  }, [tab]);

  const isMetricTab = tab !== 'detailed';
  const seriesQuery = isMetricTab ? seriesQueryFor(tab) : '';
  const history = useMetricHistory(isMetricTab, seriesQuery);

  const appsSeriesParam = isMetricTab ? appsSeriesParamFor(tab) : '';
  const appsWindow = useMetricHistoryApps(isMetricTab && appsSeriesParam !== '', appsSeriesParam, history.domain[0], history.domain[1], history.following);

  // Page-level, independent of which tab is active or selected - see
  // useDiskIoRate (the service has no push-driven disk-throughput topic, so
  // this polls the history endpoint's own trailing edge directly instead of
  // depending on whichever tab's own history.series happens to include it).
  // Paused while the Storage tab itself is active: its own useMetricHistory
  // instance already fetches disk-read/disk-write for the chart, so reading
  // that series instead avoids polling the same endpoint twice in parallel.
  const isStorageTab = tab === 'storage';
  const diskIoRate = useDiskIoRate(serviceOnline && !isStorageTab);
  const storageBytesPerSec = isStorageTab ? currentDiskRateBytesPerSec(history.series) : diskIoRate;

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
        <Badge label={formatTabChipValue(metric, sensors.cpu, sensors.gpu, sensors.memory, network.totalRate, storageBytesPerSec, numberFormat)} minWidth={minWidth} compact />
      </span>
    </span>
  );

  const tabs = TAB_DEFS
    .filter(d => d.key !== 'gpu' || gpuSupported)
    .map(d => ({
      key: d.key,
      icon: d.icon,
      label: d.chip ? tabLabelWithChip(t(d.labelKey), d.chip.metric, d.chip.minWidth) : t(d.labelKey),
    }));

  // Point-in-time snapshot (a click on the hero chart) - see
  // resolveSelectedFrame for the unified live/scrubbed/pinned semantics.
  const [clickedFrameMs, setClickedFrameMs] = useState<number | null>(null);
  const { selectedFrameMs, isPinned: isSnapshotPinned } = resolveSelectedFrame(clickedFrameMs, history.domain);
  // A pinned frame that drifts out of the viewed window falls back to the
  // window's own right edge (see resolveSelectedFrame) but clickedFrameMs
  // itself stays set - so a LATER scrub that happens to bring the window
  // back over that same stale timestamp would silently re-pin it, jumping
  // the persistent selection line onto it instead of continuing to track
  // live. Forgetting it here (the same "adjust state during render" pattern
  // as frozenFallback above) means once it's out of range it stays cleared.
  if (clickedFrameMs !== null && !isSnapshotPinned) setClickedFrameMs(null);
  const clearSnapshot = useCallback(() => setClickedFrameMs(null), []);
  const { backToLive, detach } = history;
  const backToLiveAndClearSnapshot = useCallback(() => {
    setClickedFrameMs(null);
    backToLive();
  }, [backToLive]);
  // A graph click both pins the clicked frame AND stops the live edge from
  // advancing, the same detach a TimelineBrush drag off live already makes -
  // so the chart stays put at the clicked instant instead of ticking past it.
  const onGraphClick = useCallback((t: number) => {
    setClickedFrameMs(t);
    detach();
  }, [detach]);

  // Timeline events overlay. The global toggle gates fetching too, so an
  // uninterested user pays nothing for the feature.
  const eventsEnabled = settings.monitoringEventsEnabled;
  const { events: allEvents, refetch: refetchEvents } = useMonitoringEvents(history.domain, eventsEnabled);
  const { visibleEvents } = useEventKindVisibility();
  const events = useMemo(() => visibleEvents(allEvents), [visibleEvents, allEvents]);
  const [eventsModalKey, setEventsModalKey] = useState<string | null>(null);
  const [eventsModalOpen, setEventsModalOpen] = useState(false);
  const [addEventAtMs, setAddEventAtMs] = useState<number | null>(null);

  const onEventClick = useCallback((event: TimelineEvent) => {
    setEventsModalKey(event.key);
    setEventsModalOpen(true);
  }, []);

  // Refetch either way: a delete that failed because the id was already gone
  // still needs the lane resynced, and swallowing the rejection keeps a
  // stale-id click from surfacing as an unhandled promise.
  const onRemoveCustomEvent = useCallback((id: number) => {
    void deleteCustomEvent(id).catch(() => undefined).finally(refetchEvents);
  }, [refetchEvents]);

  // Returning a string keeps PromptModal open and shows it as the field
  // error, which is the only feedback path for a rejected label (the client
  // deliberately leaves validation to the service).
  const onCreateCustomEvent = useCallback(async (label: string) => {
    if (addEventAtMs === null) return undefined;
    try {
      await createCustomEvent(addEventAtMs, label);
    } catch {
      return t('monitoring.events.addFailed');
    }
    setAddEventAtMs(null);
    refetchEvents();
    return undefined;
  }, [addEventAtMs, refetchEvents, t]);

  const renderEventTooltip = useCallback(
    (event: TimelineEvent) => eventTooltipText(t, event),
    [t],
  );

  // The detached chip shows the exact viewed instant, seconds included - finer
  // than the x-axis ticks the frame sits under.
  const windowMs = history.domain[1] - history.domain[0];
  const detachedLabel = useMemo(
    () => formatSelectedFrameTime(selectedFrameMs, windowMs),
    [windowMs, selectedFrameMs],
  );

  const gpuVramByName = useMemo(() => new Map(gpuProcMemSeries.map(s => [s.name, s.current])), [gpuProcMemSeries]);

  // Independent of the active tab - the process-detail panel's live usage
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
      case 'storage':
      case 'network': return (v: number) => formatRate(v, numberFormat);
      default: return (v: number) => localizeNumbers(`${Math.round(v)}%`, numberFormat);
    }
  }, [tab, numberFormat]);

  // Reserves the process list's own VALUE column wide enough for a
  // network/storage byte rate's worst realistic digit count (see
  // ROW_VALUE_RATE_MIN_WIDTH) so a rate change never shifts the sparkline
  // after it; cpu/gpu/memory fit the column's own default width already.
  const rowValueMinWidth = tab === 'storage' || tab === 'network' ? ROW_VALUE_RATE_MIN_WIDTH : undefined;

  // The hardware name moves here from the removed per-tab sensor blocks:
  // CPU/GPU/Memory show their resolved identity string; Storage/Network have
  // no comparable single hardware identity (storage aggregates every drive)
  // and show their plain tab name instead, at the same size/style, so every
  // tab's first element lines up.
  const titleText = tab === 'cpu' ? sensors.cpuModel
    : tab === 'gpu' ? (primaryGpu?.name ?? '')
    : tab === 'memory' ? (specs?.memory ?? '')
    : tab === 'storage' ? t('monitoring.tab.storage')
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
      <PrivacyHistoryModal
        open={privacyHistoryOpen}
        onClose={() => setPrivacyHistoryOpen(false)}
      />
      <MonitoringEventsModal
        open={eventsModalOpen}
        onClose={() => setEventsModalOpen(false)}
        events={events}
        highlightedKey={eventsModalKey}
        onRemoveCustom={onRemoveCustomEvent}
      />
      <PromptModal
        open={addEventAtMs !== null}
        title={t('monitoring.events.addTitle')}
        message={t('monitoring.events.addMessage')}
        placeholder={t('monitoring.events.addPlaceholder')}
        maxLength={120}
        onConfirm={onCreateCustomEvent}
        onCancel={() => setAddEventAtMs(null)}
      />
      <ViewHeader
        title={t('nav.monitoring')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTabChange}
        tabActions={showPrivacy ? (
          <Button size="sm" tone="neutral" icon={<History size={14} aria-hidden />} onClick={() => setPrivacyHistoryOpen(true)}>
            {t('monitoring.privacy.history.title')}
          </Button>
        ) : undefined}
      />
      <div className={`${styles.tabContent} pageBodyFill`}>
        {tab === 'detailed' ? (
          <DetailedTab sensors={sensors} />
        ) : (
          <div className={styles.metricLayout}>
            <div className={styles.metricMain}>
              {titleText && (
                <div className={styles.tabHeader}>
                  <span className={styles.tabHeaderName}>{titleText}</span>
                  {tab === 'gpu' && sensors.gpuComponents.length > 1 && (
                    <button type="button" className={styles.tabHeaderChange} onClick={openSettings}>
                      {t('monitoring.gpu.change')}
                    </button>
                  )}
                  {history.mocked && <Badge label={t('monitoring.history.mocked')} color="var(--warn)" />}
                  <div className={styles.headerControls}>
                    <HoverTooltip
                      body={eventsEnabled ? t('monitoring.events.hideAll') : t('monitoring.events.showAll')}
                      side="bottom"
                    >
                      <button
                        type="button"
                        className={eventsEnabled ? `${styles.eventsToggle} ${styles.eventsToggleOn}` : styles.eventsToggle}
                        aria-pressed={eventsEnabled}
                        aria-label={eventsEnabled ? t('monitoring.events.hideAll') : t('monitoring.events.showAll')}
                        onClick={() => update({ monitoringEventsEnabled: !eventsEnabled })}
                      >
                        <CalendarClock size={14} aria-hidden />
                      </button>
                    </HoverTooltip>
                    <LiveFollowControl
                      following={history.following}
                      detachedLabel={detachedLabel}
                      onBackToLive={backToLiveAndClearSnapshot}
                      reserveWidth={false}
                    />
                  </div>
                </div>
              )}
              <MetricHistorySection
                metric={tab}
                gpuComponents={sensors.gpuComponents}
                preferredGpuId={settings.preferredGpuId}
                history={history}
                appsWindow={appsWindow}
                fanRoles={fanRoles}
                selectedFrameMs={selectedFrameMs}
                onGraphClick={onGraphClick}
                events={eventsEnabled ? events : undefined}
                onEventClick={onEventClick}
                onAddEventAt={eventsEnabled && isSnapshotPinned ? setAddEventAtMs : undefined}
                renderEventTooltip={renderEventTooltip}
                selectedAppName={selectedProcess}
                memoryTotalMb={memoryTotalMb}
              />
              <div className={styles.listScroll}>
                <ProcessListSection
                  items={processItems}
                  formatValue={formatValue}
                  rankResetKey={rankResetKey}
                  frozen={shouldFreezeFallback}
                  onSelectProcess={handleSelectProcess}
                  selectedProcessName={selectedProcess}
                  privacySessions={privacy.sessions}
                  privacyAsOfMs={privacy.asOfMs}
                  showPrivacy={showPrivacy}
                  snapshotAtMs={isSnapshotPinned ? selectedFrameMs : null}
                  onClearSnapshot={clearSnapshot}
                  valueMinWidth={rowValueMinWidth}
                />
              </div>
            </div>
            {selectedProcess && (
              <div className={styles.metricDetail}>
                <ProcessDetailPanel
                  name={selectedProcess}
                  metric={tab}
                  onClose={handleCloseProcessDetail}
                  live={liveUsageByName.get(selectedProcess)}
                  appsWindow={appsWindow}
                  valueFormat={formatValue}
                  privacySessions={privacy.sessions}
                  privacySupported={showPrivacy}
                  selectedFrameMs={selectedFrameMs}
                  following={history.following}
                  historyFrom={history.domain[0]}
                  historyTo={history.domain[1]}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
