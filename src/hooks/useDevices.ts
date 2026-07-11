import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { setDeviceControl } from '../api/devices';
import { useTopicCallback } from './useMultiplexSocket';

export interface DeviceListItem {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  firmwareVersion: string;
  // Firmware-catalog key for the connected variant (e.g. "y70-truly", "q60").
  // Equals the device id when the variant is not yet identified.
  firmwareType?: string;
  // Whether the service actively controls this device. Missing/undefined
  // means an older payload shape; treated as on (default) by callers.
  nexusControlEnabled?: boolean;
  // True only for first-party handlers whose worker honors the on/off gate.
  // Plugin devices manage their own hardware, so the toggle is hidden.
  supportsNexusControl?: boolean;
  // True for a Nexus Control device driving non-HYTE/iBUYPOWER hardware, whose
  // support is experimental. Always false when supportsNexusControl is false.
  experimental?: boolean;
  // Device-level issue code (e.g. "usb-disconnected") the service wants
  // surfaced to the user; null/undefined means no issue. Code-driven so any
  // handler can flag a problem without new UI per device family.
  warning?: string | null;
  // Conflict-app catalog id competing with this device; drives the device-page enable gate.
  conflictAppId?: string;
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
    // Initial REST seed for the device list; subsequent updates arrive
    // via the `devices` topic below.
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

  // Optimistic flip for the toggling card; the `devices` topic refetch
  // (triggered by the service after the POST) supplies the authoritative
  // state. Reverts via refresh() if the call itself fails.
  const controlDevice = useCallback(async (id: string, nextEnabled: boolean) => {
    setDevices(prev => prev.map(d => (d.id === id ? { ...d, nexusControlEnabled: nextEnabled } : d)));
    const result = await setDeviceControl(id, nextEnabled);
    if (result && mountedRef.current) setDevices(result);
    else if (mountedRef.current) await refresh();
  }, [refresh]);

  return { devices, controlDevice };
}
