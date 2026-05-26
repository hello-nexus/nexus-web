// Fetches /devices/usb/all. Push-driven via the multiplex `devices` topic
// (DeviceBroadcaster diffs the USB list every 5s server-side and only fires
// on change), with an initial fetch on mount and a manual refresh() for the
// toolbar button.
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

export interface UsbDeviceDetail {
  vendorId: string;
  productId: string;
  name: string;
  manufacturer: string;
  serial: string;
  location: string;
  class: string;
  speed: string;
  driver: string;
  hardwareId: string;
}

export function useUsbDevices(enabled: boolean) {
  const [devices, setDevices] = useState<UsbDeviceDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchService<UsbDeviceDetail[]>('/devices/usb/all');
    if (!mountedRef.current) return;
    if (data) setDevices(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    // Initial REST seed for the USB device list; subsequent updates
    // arrive via the multiplex `devices` topic subscribed below.
     
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  useTopicCallback('devices', enabled, () => {
    void refresh();
  });

  return { devices, loading, refresh };
}
