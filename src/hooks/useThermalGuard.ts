import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGuard, setGuardEnabled, undoHeal, type GuardResponse, type HealState } from '../api/cooling';
import { useTranslation } from '../lib/i18n';
import { useTopicCallback } from './useMultiplexSocket';

// Guard state changes broadcast on the cooling topic, but the live CPU
// temperature does not, so the banner also polls on the page's own cadence.
const POLL_MS = 3000;

/** The CPU thermal guard: its state, the on/off switch, and the post-heal Undo. */
export function useThermalGuard(serviceOnline: boolean) {
  const { t } = useTranslation();
  const [guard, setGuard] = useState<GuardResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the service goes away or the page unmounts, so a response
  // from an earlier life of the effect is dropped.
  const generationRef = useRef(0);
  // Bumped by every applied write, so a poll that started before it is dropped.
  const seqRef = useRef(0);
  // The generation that has a poll in flight, so a flap offline and back online cannot overlap two.
  const inFlightRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const togglingRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    if (inFlightRef.current === generation || togglingRef.current) {
      dirtyRef.current = true;
      return;
    }
    inFlightRef.current = generation;
    const seq = seqRef.current;
    try {
      const next = await fetchGuard();
      if (next && generation === generationRef.current && seq === seqRef.current) setGuard(next);
    } finally {
      if (inFlightRef.current === generation) inFlightRef.current = null;
    }
    if (dirtyRef.current && generation === generationRef.current) {
      dirtyRef.current = false;
      void refresh();
    }
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      window.clearInterval(id);
      generationRef.current += 1;
      dirtyRef.current = false;
    };
  }, [serviceOnline, refresh]);

  useTopicCallback('cooling', serviceOnline, () => { void refresh(); });

  const toggle = useCallback(async (enabled: boolean) => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    setToggling(true);
    const generation = generationRef.current;
    try {
      const next = await setGuardEnabled(enabled);
      if (generation !== generationRef.current) return;
      if (next && next.state) {
        seqRef.current += 1;
        setGuard(next);
        setError(null);
      } else {
        setError(tRef.current('cooling.guard.error.toggle'));
      }
    } finally {
      togglingRef.current = false;
      setToggling(false);
    }
  }, []);

  const applyHeal = useCallback((heal: HealState | null) => {
    if (!heal) return;
    seqRef.current += 1;
    setGuard(prev => (prev ? { ...prev, heal } : prev));
  }, []);

  /** True when the undo landed; a failed one leaves the notice and sets `error`. */
  const undo = useCallback(async (): Promise<boolean> => {
    const heal = await undoHeal();
    if (!heal) {
      setError(tRef.current('cooling.guard.error.undo'));
      return false;
    }
    setError(null);
    applyHeal(heal);
    return true;
  }, [applyHeal]);

  return { guard, toggling, error, refresh, toggle, undo, applyHeal };
}
