import { useCallback, useEffect, useState } from 'react';
import { Fan, HardDrive, LayoutDashboard, MemoryStick, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDiagnosticsHealth } from '../../../hooks/useDiagnosticsHealth';
import { useDiagnosticsResource } from '../../../hooks/useDiagnosticsResource';
import { useDiagnosticsTemperatures } from '../../../hooks/useDiagnosticsTemperatures';
import { useMetricHistory } from '../../../hooks/useMetricHistory';
import {
  downloadDiagnosticsBundle,
  downloadDiagnosticsReport,
  fetchDiagnosticsCooling,
  fetchDiagnosticsGpu,
  fetchDiagnosticsIncidents,
  fetchDiagnosticsMemory,
  fetchDiagnosticsSmart,
  fetchDiagnosticsSystem,
  type DiagnosticsKind,
  type DiagnosticsTemperatureQuery,
} from '../../../api/diagnostics';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useToast } from '../../common/Toast/Toast';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { StorageSection } from './StorageSection';
import { MemorySection } from './MemorySection';
import { CoolingTab } from './CoolingTab';
import { SystemTab } from './SystemTab';
import { SummaryTab } from './SummaryTab';
import { SettingsTab } from './SettingsTab';
import { COOLING_HISTORY_SERIES_QUERY } from './coolingHistoryHelpers';
import { DEFAULT_INCIDENT_RANGE_HOURS, type IncidentRangeHours } from './incidentTimelineHelpers';
import { type DiagnosticsTab, visibleDiagnosticsTabs } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface DiagnosticsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  platform: string;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

const INCIDENT_WINDOW_DAYS = 30;

// The Cooling tab's chart bands solely need the sustained-high-temperature
// episodes - a fixed 7-day window matches the scrub range's own longest
// preset (RANGE_OPTIONS' '7d'). A module-level constant keeps the query's
// identity stable across renders, which useDiagnosticsTemperatures's refetch
// effect requires.
const COOLING_EPISODES_QUERY: DiagnosticsTemperatureQuery = { hours: 168 };

export function DiagnosticsView({ serviceOnline, connectionState, platform, tab: urlTab, onTabChange }: DiagnosticsViewProps) {
  const { t } = useTranslation();
  const { push } = useToast();

  const allTabs = [
    { key: 'summary', label: t('diagnostics.tab.summary'), icon: <LayoutDashboard size={14} /> },
    { key: 'storage', label: t('diagnostics.kind.storage'), icon: <HardDrive size={14} /> },
    { key: 'memory', label: t('diagnostics.kind.memory'), icon: <MemoryStick size={14} /> },
    { key: 'cooling', label: t('diagnostics.kind.cooling'), icon: <Fan size={14} /> },
    { key: 'system', label: t('diagnostics.kind.system'), icon: <ShieldCheck size={14} /> },
    { key: 'settings', label: t('diagnostics.tab.settings'), icon: <SettingsIcon size={14} /> },
  ] as const;

  const visibleKeys = visibleDiagnosticsTabs(platform);
  const tabs = allTabs.filter(tb => visibleKeys.includes(tb.key));

  // GPU is no longer its own tab (folded into Cooling); an old ?tab=gpu deep
  // link lands on Cooling, where GPU health now lives.
  const requestedTab = urlTab === 'gpu' ? 'cooling' : urlTab;
  // A tab key can be real but hidden on this platform (e.g. Memory on Linux):
  // that case corrects the route to Summary, unlike a plain unrecognized key
  // (typo'd url), which stays render-only and never writes history.
  const isRecognizedTab = requestedTab !== null && allTabs.some(tb => tb.key === requestedTab);
  const isVisibleTab = requestedTab !== null && tabs.some(tb => tb.key === requestedTab);
  const tab: DiagnosticsTab = isVisibleTab ? requestedTab as DiagnosticsTab : 'summary';

  useEffect(() => {
    if (isRecognizedTab && !isVisibleTab) onTabChange('summary');
  }, [isRecognizedTab, isVisibleTab, onTabChange]);

  const { health, loading: healthLoading, error: healthError, mocked: healthMocked, refresh: refreshHealth } = useDiagnosticsHealth(serviceOnline);
  // Re-snapshot "now" whenever a fresh poll lands, so the header's relative
  // time stays current without calling Date.now() during render (impure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [health]);

  const smart = useDiagnosticsResource(serviceOnline, fetchDiagnosticsSmart);
  const memory = useDiagnosticsResource(serviceOnline, fetchDiagnosticsMemory);
  const gpu = useDiagnosticsResource(serviceOnline, fetchDiagnosticsGpu);
  const cooling = useDiagnosticsResource(serviceOnline, fetchDiagnosticsCooling);
  const system = useDiagnosticsResource(serviceOnline, fetchDiagnosticsSystem);
  const incidents = useDiagnosticsResource(serviceOnline, useCallback(() => fetchDiagnosticsIncidents(INCIDENT_WINDOW_DAYS), []));

  // Solely feeds the Cooling chart's sustained-high-temperature bands (see
  // COOLING_EPISODES_QUERY above) - fetched regardless of the active tab,
  // like every other resource on this page, so anyMocked/anyLoading and a
  // "refresh all" both stay accurate from the Summary tab too.
  const temperatures = useDiagnosticsTemperatures(serviceOnline, COOLING_EPISODES_QUERY);

  // The chart itself scrubs via its own viewport, independent of any
  // range/day state here - only active while the Cooling tab is showing (its
  // live-tail poll runs every second, wasteful to keep running on every other
  // tab), but the hook instance lives here (not in CoolingTab) so its
  // viewport/cache survive switching away from and back to the tab.
  const isCoolingTab = tab === 'cooling';
  const coolingHistory = useMetricHistory(serviceOnline && isCoolingTab, isCoolingTab ? COOLING_HISTORY_SERIES_QUERY : '');

  // The System tab's incident timeline uses a relative-range / specific-day
  // model, kept here so it persists across tab switches. Range filtering is
  // client-side over the 30-day fetch.
  const [incidentHours, setIncidentHours] = useState<IncidentRangeHours>(DEFAULT_INCIDENT_RANGE_HOURS);
  const [incidentDate, setIncidentDate] = useState<string | null>(null);
  const handleIncidentHoursChange = useCallback((next: IncidentRangeHours) => {
    setIncidentHours(next);
    setIncidentDate(null);
  }, []);

  const anyMocked = healthMocked || smart.mocked || memory.mocked || gpu.mocked
    || cooling.mocked || system.mocked || incidents.mocked || temperatures.mocked;
  const anyLoading = healthLoading || smart.loading || memory.loading || gpu.loading
    || cooling.loading || system.loading || incidents.loading;

  // useDiagnosticsResource returns a new object every render; pulling out
  // `refresh` (stable via the hook's own useCallback) keeps these two
  // callbacks' identities stable too, instead of depending on the whole
  // per-render object.
  const { refresh: refreshSmart } = smart;
  const { refresh: refreshMemory } = memory;
  const { refresh: refreshGpu } = gpu;
  const { refresh: refreshCooling } = cooling;
  const { refresh: refreshSystem } = system;
  const { refresh: refreshIncidents } = incidents;
  const { refresh: refreshTemperatures } = temperatures;
  const { retry: retryCoolingHistory } = coolingHistory;

  const handleRefreshAll = useCallback(() => {
    refreshHealth({ force: true });
    refreshSmart({ force: true });
    refreshMemory({ force: true });
    refreshGpu({ force: true });
    refreshCooling();
    refreshSystem({ force: true });
    refreshIncidents();
    refreshTemperatures();
    retryCoolingHistory();
  }, [refreshHealth, refreshSmart, refreshMemory, refreshGpu, refreshCooling, refreshSystem, refreshIncidents, refreshTemperatures, retryCoolingHistory]);

  // Clearing the Windows event logs invalidates the health overview and the
  // System section's 30-day counts in addition to Incidents itself (which
  // force-refreshes on its own via its onRefresh prop).
  const handleLogsCleared = useCallback(() => {
    refreshHealth({ force: true });
    refreshSystem({ force: true });
  }, [refreshHealth, refreshSystem]);

  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    const ok = await downloadDiagnosticsBundle();
    setDownloading(false);
    if (!ok) push({ title: t('diagnostics.header.downloadFailed') });
  }, [push, t]);

  const [downloadingReport, setDownloadingReport] = useState(false);
  const handleDownloadReport = useCallback(async () => {
    setDownloadingReport(true);
    const ok = await downloadDiagnosticsReport();
    setDownloadingReport(false);
    if (!ok) push({ title: t('diagnostics.header.downloadReportFailed') });
  }, [push, t]);

  if (!serviceOnline) {
    return (
      <div className={styles.diagnostics}>
        <ViewHeader title={t('diagnostics.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'summary': return (
        <SummaryTab
          health={health} healthLoading={healthLoading} healthError={healthError} refreshHealth={refreshHealth}
          anyMocked={anyMocked} anyLoading={anyLoading} onRefreshAll={handleRefreshAll} now={now}
          onNavigate={(kind: DiagnosticsKind) => onTabChange(kind)}
          downloading={downloading} downloadingReport={downloadingReport}
          onDownload={() => void handleDownload()} onDownloadReport={() => void handleDownloadReport()}
        />
      );
      case 'storage': return <StorageSection data={smart.data} loading={smart.loading} error={smart.error} onRefresh={smart.refresh} />;
      case 'memory': return <MemorySection data={memory.data} loading={memory.loading} error={memory.error} onRefresh={memory.refresh} />;
      case 'cooling': return (
        <CoolingTab
          cooling={cooling}
          gpu={gpu}
          coolingHistory={coolingHistory}
          episodes={temperatures.data?.episodes ?? []}
        />
      );
      case 'system': return (
        <SystemTab
          platform={platform}
          system={system} incidents={incidents} onLogsCleared={handleLogsCleared}
          incidentHours={incidentHours} incidentDate={incidentDate}
          onIncidentHoursChange={handleIncidentHoursChange} onIncidentDateChange={setIncidentDate}
        />
      );
      case 'settings': return <SettingsTab />;
    }
  };

  return (
    <div className={styles.diagnostics}>
      <ViewHeader title={t('diagnostics.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} />
      <div className={`${styles.tabContent} pageBody`}>
        {renderTab()}
      </div>
    </div>
  );
}
