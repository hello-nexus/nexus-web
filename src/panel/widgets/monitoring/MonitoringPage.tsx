import { useCallback, useState } from 'react';
import { Cpu, Gpu, MemoryStick, Network, List } from 'lucide-react';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useProcessMonitor, useGpuProcessFeed } from '../../../hooks/useProcessMonitor';
import { useSensors } from '../../../hooks/useSensors';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { MonitoringSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { CpuTab } from './page/CpuTab';
import { GpuTab } from './page/GpuTab';
import { MemoryTab } from './page/MemoryTab';
import { NetworkTab } from './page/NetworkTab';
import { DetailedTab } from './page/DetailedTab';
import { MetricHistorySection, type HistoryMetric } from './page/MetricHistorySection';
import { MonitoringSettingsModal } from './page/MonitoringSettingsModal';
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
  const { cpuSeries, memSeries } = useProcessMonitor();
  const network = useNetworkMonitor();
  const sensors = useSensors(serviceOnline);

  // GPU surfaces appear only where the platform reports live GPU utilization
  // (Windows via LHM, NVIDIA-Linux via nvidia-smi). macOS and AMD/Intel-Linux
  // expose no GPU load, so the tab would be dead.
  const gpuSupported = sensors.gpu.some(
    s => s.type === 'Load' && (s.name === 'GPU Core' || s.name.startsWith('D3D')),
  );

  // Subscribe at page level (not in GpuTab) so per-process GPU history keeps
  // collecting across tab switches, the same as the always-on CPU/memory feeds.
  useGpuProcessFeed(gpuSupported);

  // Sample the headline CPU/memory/network sparklines at page level so they
  // keep filling across tab switches; each tab's chart reads the same buffer.
  // Keys + value derivations mirror CpuTab / MemoryTab / NetworkTab.
  const cpuTotal = sensors.cpu.find(s => s.name === 'CPU Total')?.value ?? 0;
  const memUsed = sensors.memory.find(s => s.name === 'Memory Used');
  useSensorHistoryFeed('cpu::CPU Total', cpuTotal);
  useSensorHistoryFeed('memory::Memory Used MB', memUsed ? memUsed.value * 1024 : 0);
  useSensorHistoryFeed('network::Network Total KBs', network.totalRate / 1024);

  const { settings } = useUiSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  // Top-bar settings gear opens the GPU picker modal; register only when there
  // is more than one GPU to choose from (same modal the GPU tab's Change opens).
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

  if (!serviceOnline) {
    return (
      <div className={styles.monitoring}>
        <ViewHeader title={t('nav.monitoring')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<MonitoringSkeleton />} />
      </div>
    );
  }

  const renderTabContent = () => {
    switch (tab) {
      case 'cpu': return <CpuTab cpuSeries={cpuSeries} sensors={sensors} />;
      case 'gpu': return <GpuTab sensors={sensors} preferredGpuId={settings.preferredGpuId} onOpenSettings={openSettings} />;
      case 'memory': return <MemoryTab memSeries={memSeries} />;
      case 'network': return <NetworkTab network={network} />;
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
        {tab !== 'detailed' && (
          <MetricHistorySection
            metric={tab}
            gpuComponents={sensors.gpuComponents}
            preferredGpuId={settings.preferredGpuId}
          />
        )}
        {renderTabContent()}
      </div>
    </div>
  );
}
