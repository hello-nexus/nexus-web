import { useCallback, useMemo, useState } from 'react';
import { Cpu, Gpu, MemoryStick, Network, List } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useProcessMonitor, useGpuProcessFeed, useGpuProcessData } from '../../../hooks/useProcessMonitor';
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
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { MonitoringSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DetailedTab } from './page/DetailedTab';
import { MetricHistorySection } from './page/MetricHistorySection';
import { ProcessListSection, type ProcessListItem } from './page/ProcessListSection';
import { MonitoringSettingsModal } from './page/MonitoringSettingsModal';
import { seriesQueryFor, type HistoryMetric } from './page/metricHistoryHelpers';
import { appsToProcessListItems } from './page/appWindowHelpers';
import { formatRate } from './page/shared';
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

function appsSeriesParamFor(metric: HistoryMetric, gpuAdapterLuid: string): string {
  switch (metric) {
    case 'cpu': return 'cpu';
    case 'memory': return 'memory';
    case 'network': return 'net';
    case 'gpu': return gpuAdapterLuid ? `gpu:${gpuAdapterLuid}` : '';
  }
}

export function MonitoringPage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const { t } = useTranslation();
  const { cpuSeries, memSeries } = useProcessMonitor();
  const network = useNetworkMonitor();
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

  const tabs = ([
    { key: 'cpu', label: t('monitoring.tab.cpu'), icon: <Cpu size={14} /> },
    { key: 'gpu', label: t('monitoring.tab.gpu'), icon: <Gpu size={14} /> },
    { key: 'memory', label: t('monitoring.tab.memory'), icon: <MemoryStick size={14} /> },
    { key: 'network', label: t('monitoring.tab.network'), icon: <Network size={14} /> },
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

  const appsSeriesParam = isMetricTab ? appsSeriesParamFor(tab, primaryGpu?.adapterLuid ?? '') : '';
  const appsWindow = useMetricHistoryApps(isMetricTab && appsSeriesParam !== '', appsSeriesParam, history.domain[0], history.domain[1], history.following);

  const gpuVramByName = useMemo(() => new Map(gpuProcMemSeries.map(s => [s.name, s.current])), [gpuProcMemSeries]);

  // Live fallback rows (per current metric) for when the window-scoped apps
  // endpoint is unsupported (an older/pre-endpoint service) - keeps the list
  // working, just without window-scoping (see useMetricHistoryApps's own
  // contract note).
  const fallbackItems: ProcessListItem[] = useMemo(() => {
    const toItem = (s: { name: string; current: number; values: number[] }, secondary?: string): ProcessListItem => ({
      name: s.name === 'Other' ? t('monitoring.other') : s.name,
      current: s.current,
      values: s.values,
      secondary,
    });
    switch (tab) {
      case 'cpu': return cpuSeries.map(s => toItem(s));
      case 'gpu': return gpuProcSeries.map(s => {
        const vram = gpuVramByName.get(s.name) ?? 0;
        return toItem(s, vram >= 1 ? formatMemoryMb(vram, numberFormat) : undefined);
      });
      case 'memory': return memSeries.map(s => toItem(s));
      case 'network': return network.series.map(s => toItem(s));
      default: return [];
    }
  }, [tab, cpuSeries, gpuProcSeries, gpuVramByName, memSeries, network.series, numberFormat, t]);

  // Derived once per response identity, not per render: appsToProcessListItems
  // is a pure O(apps) mapping (avg/max/points already computed server-side),
  // re-run only when a fresh apps response (or the live fallback) actually
  // lands - never on every render/tick. Falls back to the live per-metric
  // data both when the endpoint is unsupported AND while its first fetch for
  // the current metric is still in flight (appsWindow.ready), so a metric
  // switch shows the new metric's live rows immediately instead of an empty
  // list for the debounce/fetch round trip.
  const usingAppsWindow = appsWindow.supported && appsWindow.ready;
  const processItems = useMemo(
    () => (usingAppsWindow ? appsToProcessListItems(appsWindow.apps) : fallbackItems),
    [usingAppsWindow, appsWindow.apps, fallbackItems],
  );

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
  // comparable hardware identity and keeps its plain tab title.
  const titleText = tab === 'cpu' ? sensors.cpuModel
    : tab === 'gpu' ? (primaryGpu?.name ?? '')
    : tab === 'memory' ? (specs?.memory ?? '')
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
      <div className={`${styles.tabContent} pageBody`}>
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
              </div>
            )}
            <MetricHistorySection
              metric={tab}
              gpuComponents={sensors.gpuComponents}
              preferredGpuId={settings.preferredGpuId}
              history={history}
              appsWindow={appsWindow}
            />
            <ProcessListSection items={processItems} formatValue={formatValue} rankResetKey={rankResetKey} />
          </>
        )}
      </div>
    </div>
  );
}
