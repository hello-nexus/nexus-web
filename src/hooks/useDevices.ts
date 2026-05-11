import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

export interface DeviceListItem {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  firmwareVersion: string;
}

export function useDevices(enabled: boolean) {
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await fetchService<DeviceListItem[]>('/devices/all');
    if (data && mountedRef.current) setDevices(data);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  // Push-driven: the `devices` topic fires when the service-side
  // DeviceBroadcaster diffs the curated/USB device list and sees a change.
  useTopicCallback('devices', enabled, () => {
    void refresh();
  });

  return devices;
}
