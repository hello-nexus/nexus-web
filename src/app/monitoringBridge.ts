import { useEffect } from 'react';
import { fetchService } from '../api/service';
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
    fetchService<{ msg: string }>('/system/memory/total').then(data => {
      if (data?.msg) {
        const match = data.msg.match(/([\d.]+)\s*(GB|MB)/i);
        if (match) {
          const val = parseFloat(match[1]);
          monitoringStore.setSystemMemMb(match[2].toUpperCase() === 'GB' ? val * 1024 : val);
        }
      }
    });
    return () => {
      multiplex.unsubscribe('monitoring', onMonitoring);
      multiplex.unsubscribe('screentime', onScreenTime);
    };
  }, [multiplex]);
}
