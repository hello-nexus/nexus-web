import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fan, Gpu as GpuIcon, HardDrive, LayoutDashboard, MemoryStick, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDiagnosticsHealth } from '../../../hooks/useDiagnosticsHealth';
import { useDiagnosticsResource } from '../../../hooks/useDiagnosticsResource';
import { useDiagnosticsTemperatureApps } from '../../../hooks/useDiagnosticsTemperatureApps';
import { useDiagnosticsTemperatures } from '../../../hooks/useDiagnosticsTemperatures';
import { useSystemSpecs } from '../../../hooks/useSystemSpecs';
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
import { GpuSection } from './GpuSection';
import { CoolingTab } from './CoolingTab';
import { SystemTab } from './SystemTab';
import { SummaryTab } from './SummaryTab';
import { SettingsTab } from './SettingsTab';
import { DEFAULT_TEMPERATURE_RANGE_HOURS, type TemperatureRangeHours } from './temperatureHelpers';
import styles from './DiagnosticsView.module.scss';

type DiagnosticsTab = 'summary' | 'storage' | 'memory' | 'gpu' | 'cooling' | 'system' | 'settings';

interface DiagnosticsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

const INCIDENT_WINDOW_DAYS = 30;

export function DiagnosticsView({ serviceOnline, connectionState, tab: urlTab, onTabChange }: DiagnosticsViewProps) {
  const { t } = useTranslation();
  const { push } = useToast();
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
  const { specs } = useSystemSpecs(serviceOnline);

  // Lives here (not in CoolingTab) so the selected range/day and fetched data
  // survive switching away from and back to the Cooling tab, matching every
  // other resource on this page. A relative range and a specific day are
  // mutually exclusive: picking a day switches to date mode, and clicking any
  // range chip switches back to that relative range.
  const [temperatureHours, setTemperatureHours] = useState<TemperatureRangeHours>(DEFAULT_TEMPERATURE_RANGE_HOURS);
  const [temperatureDate, setTemperatureDate] = useState<string | null>(null);
  const temperatureQuery = useMemo<DiagnosticsTemperatureQuery>(
    () => (temperatureDate ? { date: temperatureDate } : { hours: temperatureHours }),
    [temperatureDate, temperatureHours],
  );
  const temperatures = useDiagnosticsTemperatures(serviceOnline, temperatureQuery);
  const handleTemperatureHoursChange = useCallback((next: TemperatureRangeHours) => {
    setTemperatureHours(next);
    setTemperatureDate(null);
  }, []);

  // Backs the temperature chart's hover tooltip app breakdown; reuses the
  // same memoized temperatureQuery so it always covers the chart's window.
  const temperatureApps = useDiagnosticsTemperatureApps(serviceOnline, temperatureQuery);

  const anyMocked = healthMocked || smart.mocked || memory.mocked || gpu.mocked
    || cooling.mocked || system.mocked || incidents.mocked;
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

  const handleRefreshAll = useCallback(() => {
    refreshHealth({ force: true });
    refreshSmart({ force: true });
    refreshMemory({ force: true });
    refreshGpu({ force: true });
    refreshCooling();
    refreshSystem({ force: true });
    refreshIncidents();
    refreshTemperatures();
  }, [refreshHealth, refreshSmart, refreshMemory, refreshGpu, refreshCooling, refreshSystem, refreshIncidents, refreshTemperatures]);

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

  const tabs = [
    { key: 'summary', label: t('diagnostics.tab.summary'), icon: <LayoutDashboard size={14} /> },
    { key: 'storage', label: t('diagnostics.kind.storage'), icon: <HardDrive size={14} /> },
    { key: 'memory', label: t('diagnostics.kind.memory'), icon: <MemoryStick size={14} /> },
    { key: 'gpu', label: t('diagnostics.kind.gpu'), icon: <GpuIcon size={14} /> },
    { key: 'cooling', label: t('diagnostics.kind.cooling'), icon: <Fan size={14} /> },
    { key: 'system', label: t('diagnostics.kind.system'), icon: <ShieldCheck size={14} /> },
    { key: 'settings', label: t('diagnostics.tab.settings'), icon: <SettingsIcon size={14} /> },
  ] as const;

  const tab: DiagnosticsTab = urlTab && tabs.some(tb => tb.key === urlTab)
    ? urlTab as DiagnosticsTab : 'summary';

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
          memory={memory.data} gpu={gpu.data} specs={specs}
          anyMocked={anyMocked} anyLoading={anyLoading} onRefreshAll={handleRefreshAll} now={now}
          onNavigate={(kind: DiagnosticsKind) => onTabChange(kind)}
          downloading={downloading} downloadingReport={downloadingReport}
          onDownload={() => void handleDownload()} onDownloadReport={() => void handleDownloadReport()}
        />
      );
      case 'storage': return <StorageSection data={smart.data} loading={smart.loading} error={smart.error} onRefresh={smart.refresh} />;
      case 'memory': return <MemorySection data={memory.data} loading={memory.loading} error={memory.error} onRefresh={memory.refresh} />;
      case 'gpu': return <GpuSection data={gpu.data} loading={gpu.loading} error={gpu.error} onRefresh={gpu.refresh} />;
      case 'cooling': return (
        <CoolingTab
          cooling={cooling}
          temperatures={temperatures}
          hours={temperatureHours}
          date={temperatureDate}
          onHoursChange={handleTemperatureHoursChange}
          onDateChange={setTemperatureDate}
          appUsageData={temperatureApps.data}
        />
      );
      case 'system': return <SystemTab system={system} incidents={incidents} onLogsCleared={handleLogsCleared} />;
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
