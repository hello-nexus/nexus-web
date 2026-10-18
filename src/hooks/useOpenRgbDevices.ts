import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLightingDevices, type LightingDevice } from '../api/lighting';
import { setOpenRgbCardsControlled } from '../panel/widgets/devices/openRgbDevices';

const POLL_MS = 3000;

/** The Lighting page's device list (polled at its cadence) plus whether the OpenRGB daemon is up. */
export function useOpenRgbDevices(enabled: boolean) {
  const [cards, setCards] = useState<LightingDevice[]>([]);
  const [daemonUp, setDaemonUp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  // A poll that started before a toggle still answers with the old value, and applying it would flip the switch back.
  const mutations = useRef(0);
  const pendingWrites = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const seq = mutations.current;
    const res = await fetchLightingDevices().catch(() => null);
    if (!res || !mounted.current) return;
    if (pendingWrites.current > 0 || seq !== mutations.current) return;
    setCards(res.devices);
    setDaemonUp(res.rgbRunning === true);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  /** Optimistic flip, then the writes; the refetch afterwards is authoritative, so a failed write reverts the switch. */
  const setControlled = useCallback(async (ids: readonly string[], controlled: boolean) => {
    const set = new Set(ids);
    mutations.current++;
    pendingWrites.current++;
    setCards(prev => prev.map(c => (set.has(c.id) ? { ...c, controlled } : c)));
    try {
      await setOpenRgbCardsControlled(ids, controlled);
    } finally {
      pendingWrites.current--;
      mutations.current++;
    }
    await refresh();
  }, [refresh]);

  return useMemo(
    () => ({ cards, daemonUp, loaded, refresh, setControlled }),
    [cards, daemonUp, loaded, refresh, setControlled],
  );
}
