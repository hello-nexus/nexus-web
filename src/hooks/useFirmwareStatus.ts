import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

export interface FlashableImage {
  firmwareType: string;   // catalog key for this image (pass to the flash endpoint)
  version: string;
}

export interface FirmwareStatusItem {
  deviceType: string;       // handler id - identity + icon key
  firmwareType: string;     // catalog key (connected variant) - pass to the flash endpoint
  name: string;
  category: string;
  currentVersion: string;
  availableVersion: string;
  updateAvailable: boolean;
  availableVersions: string[];  // connected variant's bundled versions
  devImages: FlashableImage[];  // all images the device can flash (incl. sibling variants) - dev picker
}

// Backs the Firmware Updates page. Reports, per connected supported device,
// the version it's running vs the newest version bundled in this build. Seeds
// over REST then refreshes on the `devices` topic (same diff signal that drives
// the device list), so plugging/unplugging a device updates the table.
export function useFirmwareStatus(enabled: boolean) {
  const [items, setItems] = useState<FirmwareStatusItem[]>([]);
  // Flips true once the first fetch settles, so consumers can tell "still
  // loading" from "loaded, no matching item" (the Q-series install gate).
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await fetchService<FirmwareStatusItem[]>('/devices/firmware/status');
    if (!mountedRef.current) return;
    if (data) setItems(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    void refresh();
    // The devices topic only fires on bus changes, so a transiently failed
    // fetch (or a server-side shell hiccup that omitted an item) would
    // otherwise render a wrong state until the next hotplug. Slow
    // reconciliation re-poll while a consumer is mounted.
    const intervalId = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      window.clearInterval(intervalId);
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  useTopicCallback('devices', enabled, () => {
    void refresh();
  });

  return { items, loaded };
}
