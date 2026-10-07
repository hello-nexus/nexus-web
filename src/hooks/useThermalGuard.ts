import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeGuardTrip, fetchGuard, keepHeal, setGuardConfig, undoHeal, type GuardResponse, type HealState } from '../api/cooling';
import { useTranslation } from '../lib/i18n';
import { newGuardError, type GuardErrorState } from '../panel/widgets/cooling/page/guardUtils';
import { useTopicCallback } from './useMultiplexSocket';

// Guard state changes broadcast on the cooling topic, but the live CPU
// temperature does not, so the banner also polls on the page's own cadence.
const POLL_MS = 3000;

// Identifies one trip and its state, so a failure about it expires when the trip changes or ends.
const tripKeyOf = (g: GuardResponse | null): string =>
  g?.lastTrip ? `${g.lastTrip.atUtcMs}:${g.lastTrip.endedAtUtcMs ?? 'active'}` : 'none';

/** The CPU thermal guard: its state, the on/off switch, and the post-heal Undo. */
export function useThermalGuard(serviceOnline: boolean) {
  const { t } = useTranslation();
  const [guard, setGuard] = useState<GuardResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  // When the guard was last fetched: the notice's age cut-off needs a clock that is not read during render.
  const [fetchedAtMs, setFetchedAtMs] = useState(0);
  const [error, setError] = useState<GuardErrorState | null>(null);
  // The switch and the limit each report their own failure, beside their own control.
  const [toggleError, setToggleError] = useState<GuardErrorState | null>(null);
  const [limitError, setLimitError] = useState<GuardErrorState | null>(null);
  const [lintWarningsError, setLintWarningsError] = useState<GuardErrorState | null>(null);
  // A refused trip dismissal, tied to the trip it was for: a new or ended trip makes it moot.
  const [ackFailure, setAckFailure] = useState<{ tripKey: string; error: GuardErrorState } | null>(null);
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
  const tRef = useRef(t);
  tRef.current = t;

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    if (inFlightRef.current === generation) {
      dirtyRef.current = true;
      return;
    }
    inFlightRef.current = generation;
    const seq = seqRef.current;
    try {
      const next = await fetchGuard();
      if (next && generation === generationRef.current && seq === seqRef.current) {
        setGuard(next);
        setFetchedAtMs(Date.now());
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

  // What the user last asked for, per field. Every action overwrites its field and
  // kicks the single writer. Each pass sends up to three requests, in order: the
  // switch, the limit, then the hazard-warning setting, and loops while new intents arrive, so nothing is dropped,
  // reordered or reversed.
  const intentRef = useRef<{ enabled?: boolean; limit?: number | 'reset'; lintWarnings?: boolean }>({});
  const writerRunningRef = useRef(false);
  // The limit shown while it is pending, so the slider does not snap back to the server's value.
  const [pendingLimit, setPendingLimit] = useState<number | 'reset' | null>(null);

  const runWriter = useCallback(async () => {
    if (writerRunningRef.current) return;
    writerRunningRef.current = true;
    setToggling(true);
    // One request, applied to the guard and reported under its own error slot.
    const send = async (
      body: Parameters<typeof setGuardConfig>[0],
      errorKey: string,
      setSlot: (e: GuardErrorState | null) => void,
    ) => {
      const generation = generationRef.current;
      let next: GuardResponse | null = null;
      try {
        next = await setGuardConfig(body);
      } catch {
        next = null;
      }
      if (generation !== generationRef.current) return;
      if (next && next.state) {
        seqRef.current += 1;
        setGuard(next);
        setSlot(null);
      } else {
        setSlot(newGuardError(tRef.current(errorKey)));
      }
    };
    try {
      while (
        intentRef.current.enabled !== undefined
        || intentRef.current.limit !== undefined
        || intentRef.current.lintWarnings !== undefined
      ) {
        const { enabled, limit, lintWarnings } = intentRef.current;
        intentRef.current = {};
        // The switch goes alone: a limit the service refuses must not take the toggle down with it.
        if (enabled !== undefined) {
          await send({ enabled }, 'cooling.guard.error.toggle', setToggleError);
        }
        if (limit !== undefined) {
          await send(
            limit === 'reset' ? { clearLimitOverride: true } : { limitOverrideC: limit },
            'cooling.guard.error.limit',
            setLimitError,
          );
        }
        if (lintWarnings !== undefined) {
          await send({ lintWarnings }, 'cooling.guard.error.lintWarnings', setLintWarningsError);
        }
        // The display override ends once no newer limit intent is waiting.
        if (intentRef.current.limit === undefined) setPendingLimit(null);
      }
    } finally {
      writerRunningRef.current = false;
      setToggling(false);
      if (intentRef.current.limit === undefined) setPendingLimit(null);
    }
  }, []);

  const toggle = useCallback((enabled: boolean) => {
    intentRef.current.enabled = enabled;
    void runWriter();
  }, [runWriter]);
  const setLimit = useCallback((limit: number) => {
    intentRef.current.limit = limit;
    setPendingLimit(limit);
    void runWriter();
  }, [runWriter]);
  const setLintWarnings = useCallback((lintWarnings: boolean) => {
    intentRef.current.lintWarnings = lintWarnings;
    void runWriter();
  }, [runWriter]);
  const clearLimit = useCallback(() => {
    intentRef.current.limit = 'reset';
    setPendingLimit('reset');
    void runWriter();
  }, [runWriter]);

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

  /** True when the heal was kept; a failed keep leaves the notice and sets `error`. */
  const keep = useCallback(async (): Promise<boolean> => {
    const heal = await keepHeal();
    if (!heal) {
      // Tagged like an Undo failure: it is moot once the snapshot is gone.
      setError(newGuardError(tRef.current('cooling.guard.error.keep'), 'undo'));
      return false;
    }
    setError(null);
    applyHeal(heal);
    return true;
  }, [applyHeal]);

  /** Dismisses an ended trip. True when the service accepted it and its guard became the state. */
  const acknowledgeTrip = useCallback(async (): Promise<boolean> => {
    const res = await acknowledgeGuardTrip();
    if (!res || res.error || !res.state) {
      setAckFailure({
        tripKey: tripKeyOf(guardRef.current),
        error: newGuardError(tRef.current('diagnostics.cooling.guardTrip.error')),
      });
      return false;
    }
    setAckFailure(null);
    seqRef.current += 1;
    setGuard(res);
    return true;
  }, []);

  const ackError = ackFailure && ackFailure.tripKey === tripKeyOf(guard) ? ackFailure.error : null;

  const clearError = useCallback(() => setError(null), []);

  return { guard, fetchedAtMs, toggling, pendingLimit, error, toggleError, limitError, lintWarningsError, ackError, clearError, refresh, toggle, setLimit, clearLimit, setLintWarnings, acknowledgeTrip, undo, keep, applyHeal };
}
