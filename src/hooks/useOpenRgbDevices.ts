import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLightingDevices, fetchLightingStatus, type LightingDevice } from '../api/lighting';

const POLL_MS = 3000;

/** The Lighting page's device list (polled at its cadence) plus whether the OpenRGB daemon is up. */
export function useOpenRgbDevices(enabled: boolean) {
  const [cards, setCards] = useState<LightingDevice[]>([]);
  const [daemonUp, setDaemonUp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([
      fetchLightingDevices().catch(() => null),
      fetchLightingStatus().catch(() => null),
    ]);
    if (!mounted.current) return;
    if (list) setCards(list.devices);
    setDaemonUp(status?.rgbRunning === true);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const setControlledLocal = useCallback((ids: readonly string[], controlled: boolean) => {
    const set = new Set(ids);
    setCards(prev => prev.map(c => (set.has(c.id) ? { ...c, controlled } : c)));
  }, []);

  return { cards, daemonUp, loaded, refresh, setControlledLocal };
}
