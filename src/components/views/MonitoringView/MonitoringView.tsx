import { useCallback, useState } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useMonitoringFrame } from '../../../hooks/useMonitoringFrame';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useProcessMonitor } from '../../../hooks/useProcessMonitor';
import { useSensors } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import * as monitoringStore from '../../../lib/monitoringStore';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { ScreenTimeBrowse } from '../ScreenTimeBrowse/ScreenTimeBrowse';
import { ScreenTimeDataControl } from '../ScreenTimeBrowse/ScreenTimeDataControl';
import { MonitoringSkeleton } from '../PageSkeleton/PageSkeleton';
import { OverviewTab } from './OverviewTab';
import { CpuTab } from './CpuTab';
import { MemoryTab } from './MemoryTab';
import { NetworkTab } from './NetworkTab';
import { DetailedTab } from './DetailedTab';
import styles from './MonitoringView.module.scss';

type MonitoringTab = 'overview' | 'cpu' | 'memory' | 'network' | 'screentime' | 'detailed';
const VALID_TABS: MonitoringTab[] = ['overview', 'cpu', 'memory', 'network', 'screentime', 'detailed'];

interface MonitoringViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function MonitoringView({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const tab: MonitoringTab = urlTab && VALID_TABS.includes(urlTab as MonitoringTab)
    ? urlTab as MonitoringTab : 'overview';

  const { t } = useTranslation();
  const monitoringFrame = useMonitoringFrame();
  const { cpuSeries, memSeries, sampleCount, totalCpu, systemMemMb } = useProcessMonitor();
  const network = useNetworkMonitor();
  const sensors = useSensors(serviceOnline);
  const overviewHist = monitoringStore.getOverviewHist();
  const [dataControlOpen, setDataControlOpen] = useState(false);
  const [browseRefresh, setBrowseRefresh] = useState(0);

  const { settings, update } = useUiSettings();
  const showAverage = settings.monitoringShowAverage;

  const toggleMode = useCallback(() => {
    update({ monitoringShowAverage: !showAverage });
  }, [showAverage, update]);

  const tabs = [
    { key: 'overview', label: t('monitoring.tab.overview') },
    { key: 'cpu', label: t('monitoring.tab.cpu') },
    { key: 'memory', label: t('monitoring.tab.memory') },
    { key: 'network', label: t('monitoring.tab.network') },
    { key: 'screentime', label: t('monitoring.tab.screentime') },
    { key: 'detailed', label: t('monitoring.tab.detailed') },
  ] as const;

  if (!serviceOnline) {
    return (
      <div className={styles.monitoring}>
        <ViewHeader title={t('nav.monitoring')} titleTooltip={t('monitoring.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<MonitoringSkeleton />} />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'overview': return (
        <OverviewTab frame={monitoringFrame} hist={overviewHist} onNavigate={onTabChange} />
      );
      case 'cpu': return <CpuTab cpuSeries={cpuSeries} sampleCount={sampleCount} totalCpu={totalCpu} showAverage={showAverage} onToggle={toggleMode} />;
      case 'memory': return <MemoryTab memSeries={memSeries} sampleCount={sampleCount} systemMemMb={systemMemMb} showAverage={showAverage} onToggle={toggleMode} />;
      case 'network': return <NetworkTab network={network} showAverage={showAverage} onToggle={toggleMode} />;
      case 'screentime': return <ScreenTimeBrowse key={browseRefresh} onManageData={() => setDataControlOpen(true)} />;
      case 'detailed': return <DetailedTab sensors={sensors} />;
    }
  };

  return (
    <div className={styles.monitoring}>
      <ViewHeader title={t('nav.monitoring')} titleTooltip={t('monitoring.title.tooltip')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} />
      <div className={styles.tabContent}>
        {renderTab()}
      </div>
      <ScreenTimeDataControl
        open={dataControlOpen}
        onClose={() => setDataControlOpen(false)}
        onChanged={() => setBrowseRefresh(v => v + 1)}
      />
    </div>
  );
}
