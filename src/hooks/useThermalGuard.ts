import { useCallback, useEffect, useState } from 'react';
import { fetchGuard, setGuardEnabled, undoHeal, type GuardResponse, type HealState } from '../api/cooling';
import { useTopicCallback } from './useMultiplexSocket';

// Guard state changes broadcast on the cooling topic, but the live CPU
// temperature does not, so the banner also polls on the page's own cadence.
const POLL_MS = 3000;

/** The CPU thermal guard: its state, the on/off switch, and the post-heal Undo. */
export function useThermalGuard(serviceOnline: boolean) {
  const [guard, setGuard] = useState<GuardResponse | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchGuard();
    if (next) setGuard(next);
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [serviceOnline, refresh]);

  useTopicCallback('cooling', serviceOnline, () => { void refresh(); });

  const toggle = useCallback(async (enabled: boolean) => {
    const next = await setGuardEnabled(enabled);
    if (next) setGuard(next);
  }, []);

  const applyHeal = useCallback((heal: HealState | null) => {
    if (heal) setGuard(prev => (prev ? { ...prev, heal } : prev));
  }, []);

  const undo = useCallback(async () => {
    applyHeal(await undoHeal());
  }, [applyHeal]);

  return { guard, refresh, toggle, undo, applyHeal };
}
