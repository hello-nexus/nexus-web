import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGuard, setGuardConfig, setGuardEnabled, undoHeal, type GuardResponse, type HealState } from '../api/cooling';
import { useTranslation } from '../lib/i18n';
import { newGuardError, type GuardErrorState } from '../panel/widgets/cooling/page/guardUtils';
import { useTopicCallback } from './useMultiplexSocket';

// Guard state changes broadcast on the cooling topic, but the live CPU
// temperature does not, so the banner also polls on the page's own cadence.
const POLL_MS = 3000;

/** The CPU thermal guard: its state, the on/off switch, and the post-heal Undo. */
export function useThermalGuard(serviceOnline: boolean) {
  const { t } = useTranslation();
  const [guard, setGuard] = useState<GuardResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<GuardErrorState | null>(null);
  const guardRef = useRef<GuardResponse | null>(null);
  guardRef.current = guard;
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
      if (next && generation === generationRef.current && seq === seqRef.current) {
        setGuard(next);
        // A failed Undo is moot once the service no longer holds the snapshot.
        if (!next.heal.undoAvailable) setError(prev => (prev?.kind === 'undo' ? null : prev));
      }
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

  // One write at a time: the switch and the limit share the pending state and the error slot.
  const write = useCallback(async (send: () => Promise<GuardResponse | null>, errorKey: string) => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    setToggling(true);
    const generation = generationRef.current;
    try {
      const next = await send();
      if (generation !== generationRef.current) return;
      if (next && next.state) {
        seqRef.current += 1;
        setGuard(next);
        setError(null);
      } else {
        setError(newGuardError(tRef.current(errorKey)));
      }
    } finally {
      togglingRef.current = false;
      setToggling(false);
    }
  }, []);

  const toggle = useCallback(
    (enabled: boolean) => write(() => setGuardEnabled(enabled), 'cooling.guard.error.toggle'),
    [write],
  );
  const setLimit = useCallback(
    (limitOverrideC: number) => write(() => setGuardConfig({ limitOverrideC }), 'cooling.guard.error.limit'),
    [write],
  );
  const clearLimit = useCallback(
    () => write(() => setGuardConfig({ clearLimitOverride: true }), 'cooling.guard.error.limit'),
    [write],
  );

  const applyHeal = useCallback((heal: HealState | null) => {
    if (!heal) return;
    seqRef.current += 1;
    // Nothing to merge into yet: read the whole guard so Undo shows without waiting a poll.
    if (!guardRef.current) { void refresh(); return; }
    setGuard(prev => (prev ? { ...prev, heal } : prev));
  }, [refresh]);

  /** True when the undo landed; a failed one leaves the notice and sets `error`. */
  const undo = useCallback(async (): Promise<boolean> => {
    const heal = await undoHeal();
    if (!heal) {
      setError(newGuardError(tRef.current('cooling.guard.error.undo'), 'undo'));
      return false;
    }
    setError(null);
    applyHeal(heal);
    return true;
  }, [applyHeal]);

  const clearError = useCallback(() => setError(null), []);

  return { guard, toggling, error, clearError, refresh, toggle, setLimit, clearLimit, undo, applyHeal };
}
