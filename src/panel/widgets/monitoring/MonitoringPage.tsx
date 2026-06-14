import { useCallback, useState } from 'react';
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
import { GpuTab } from './page/GpuTab';
import { MemoryTab } from './page/MemoryTab';
import { NetworkTab } from './page/NetworkTab';
import { DetailedTab } from './page/DetailedTab';
import { MonitoringSettingsModal } from './page/MonitoringSettingsModal';
import { usePageSettingsAction } from '../../../app/PageChrome';
import styles from './MonitoringPage.module.scss';

type MonitoringTab = 'overview' | 'cpu' | 'gpu' | 'memory' | 'network' | 'detailed';

interface MonitoringViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export function MonitoringPage({ serviceOnline, connectionState, tab: urlTab, onTabChange }: MonitoringViewProps) {
  const { t } = useTranslation();
  const monitoringFrame = useMonitoringFrame();
  const { cpuSeries, memSeries } = useProcessMonitor();
  const network = useNetworkMonitor();
  const sensors = useSensors(serviceOnline);
  const overviewHist = monitoringStore.getOverviewHist();

  // GPU surfaces appear only where the platform reports live GPU utilization
  // (Windows via LHM, NVIDIA-Linux via nvidia-smi). macOS and AMD/Intel-Linux
  // expose no GPU load, so the tab and overview card would be dead.
  const gpuSupported = sensors.gpu.some(
    s => s.type === 'Load' && (s.name === 'GPU Core' || s.name.startsWith('D3D')),
  );

  const { settings, update } = useUiSettings();
  const showAverage = settings.monitoringShowAverage;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleMode = useCallback(() => {
    update({ monitoringShowAverage: !showAverage });
  }, [showAverage, update]);

  // The settings affordance lives in the top bar (right of the search pill).
  // Its only control is the primary-GPU picker, so register it only when more
  // than one GPU is present - there's nothing to choose otherwise.
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  usePageSettingsAction(
    { onOpen: openSettings, label: t('monitoring.settings.open') },
    serviceOnline && sensors.gpuComponents.length > 1,
  );

  const tabs = ([
    { key: 'overview', label: t('monitoring.tab.overview') },
    { key: 'cpu', label: t('monitoring.tab.cpu') },
    { key: 'gpu', label: t('monitoring.tab.gpu') },
    { key: 'memory', label: t('monitoring.tab.memory') },
    { key: 'network', label: t('monitoring.tab.network') },
    { key: 'detailed', label: t('monitoring.tab.detailed') },
  ] as const).filter(tb => tb.key !== 'gpu' || gpuSupported);

  const tab: MonitoringTab = urlTab && tabs.some(tb => tb.key === urlTab)
    ? urlTab as MonitoringTab : 'overview';

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
        <OverviewTab frame={monitoringFrame} hist={overviewHist} gpuSupported={gpuSupported} onNavigate={onTabChange} />
      );
      case 'cpu': return <CpuTab cpuSeries={cpuSeries} sensors={sensors} showAverage={showAverage} onToggle={toggleMode} />;
      case 'gpu': return <GpuTab sensors={sensors} />;
      case 'memory': return <MemoryTab memSeries={memSeries} sensors={sensors} showAverage={showAverage} onToggle={toggleMode} />;
      case 'network': return <NetworkTab network={network} showAverage={showAverage} onToggle={toggleMode} />;
      case 'detailed': return <DetailedTab sensors={sensors} />;
    }
  };

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
        {renderTab()}
      </div>
    </div>
  );
}
