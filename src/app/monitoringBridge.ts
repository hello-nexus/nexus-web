import { useEffect } from 'react';
import type { useMultiplexConnection } from '../hooks/useMultiplexSocket';
import * as monitoringStore from '../lib/monitoringStore';
import type { MonitoringFrame } from '../hooks/useMonitoringFrame';
import type { ScreenTimeData } from '../hooks/useScreenTime';

export function useMonitoringStoreBridge(multiplex: ReturnType<typeof useMultiplexConnection>) {
  useEffect(() => {
    if (!multiplex) return;
    const onMonitoring = (data: unknown) =>
      monitoringStore.ingestMonitoring(data as MonitoringFrame);
    const onScreenTime = (data: unknown) =>
      monitoringStore.ingestScreenTime(data as ScreenTimeData);
    multiplex.subscribe('monitoring', onMonitoring);
    multiplex.subscribe('screentime', onScreenTime);
    return () => {
      multiplex.unsubscribe('monitoring', onMonitoring);
      multiplex.unsubscribe('screentime', onScreenTime);
    };
  }, [multiplex]);
}
