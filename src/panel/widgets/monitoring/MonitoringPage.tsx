import { useCallback } from 'react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useMonitoringFrame } from '../../../hooks/useMonitoringFrame';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useProcessMonitor } from '../../../hooks/useProcessMonitor';
import { useSensors } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import * as monitoringStore from '../../../lib/monitoringStore';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { MonitoringSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { OverviewTab } from './page/OverviewTab';
import { CpuTab } from './page/CpuTab';
import { MemoryTab } from './page/MemoryTab';
import { NetworkTab } from './page/NetworkTab';
import { DetailedTab } from './page/DetailedTab';
import { GpuSelect } from './page/GpuSelect';
import styles from './MonitoringPage.module.scss';

type MonitoringTab = 'overview' | 'cpu' | 'memory' | 'network' | 'detailed';
const VALID_TABS: MonitoringTab[] = ['overview', 'cpu', 'memory', 'network', 'detailed'];

interface MonitoringViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function MonitoringPage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const tab: MonitoringTab = urlTab && VALID_TABS.includes(urlTab as MonitoringTab)
    ? urlTab as MonitoringTab : 'overview';

  const { t } = useTranslation();
  const monitoringFrame = useMonitoringFrame();
  const { cpuSeries, memSeries } = useProcessMonitor();
  const network = useNetworkMonitor();
  const sensors = useSensors(serviceOnline);
  const overviewHist = monitoringStore.getOverviewHist();

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
    { key: 'detailed', label: t('monitoring.tab.detailed') },
  ] as const;

  if (!serviceOnline) {
    return (
      <div className={styles.monitoring}>
        <ViewHeader title={t('nav.monitoring')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<MonitoringSkeleton />} />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'overview': return (
        <OverviewTab frame={monitoringFrame} hist={overviewHist} onNavigate={onTabChange} />
      );
      case 'cpu': return <CpuTab cpuSeries={cpuSeries} sensors={sensors} showAverage={showAverage} onToggle={toggleMode} />;
      case 'memory': return <MemoryTab memSeries={memSeries} sensors={sensors} showAverage={showAverage} onToggle={toggleMode} />;
      case 'network': return <NetworkTab network={network} showAverage={showAverage} onToggle={toggleMode} />;
      case 'detailed': return <DetailedTab sensors={sensors} />;
    }
  };

  // The GPU picker is global but only relevant where GPU sensors show, and only
  // useful when there's a choice to make (iGPU + dGPU).
  const showGpuSelect = (tab === 'overview' || tab === 'detailed') && sensors.gpuComponents.length > 1;

  return (
    <div className={styles.monitoring}>
      <ViewHeader
        title={t('nav.monitoring')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTabChange}
        tabActions={showGpuSelect ? <GpuSelect gpus={sensors.gpuComponents} /> : undefined}
      />
      <div className={styles.tabContent}>
        {renderTab()}
      </div>
    </div>
  );
}
