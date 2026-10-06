import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGuard, setGuardEnabled, undoHeal, type GuardResponse, type HealState } from '../api/cooling';
import { useToastSafe } from '../components/common/Toast/Toast';
import { useTranslation } from '../lib/i18n';
import { useTopicCallback } from './useMultiplexSocket';

// Guard state changes broadcast on the cooling topic, but the live CPU
// temperature does not, so the banner also polls on the page's own cadence.
const POLL_MS = 3000;

/** The CPU thermal guard: its state, the on/off switch, and the post-heal Undo. */
export function useThermalGuard(serviceOnline: boolean) {
  const { t } = useTranslation();
  const toast = useToastSafe();
  const [guard, setGuard] = useState<GuardResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  // Bumped when the service goes away or the page unmounts, so a response
  // from an earlier life of the effect is dropped.
  const generationRef = useRef(0);
  // Bumped by every applied write, so a poll that started before it is dropped.
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const togglingRef = useRef(false);
  const toastRef = useRef({ toast, t });
  toastRef.current = { toast, t };

  const refresh = useCallback(async () => {
    if (inFlightRef.current || togglingRef.current) {
      dirtyRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const generation = generationRef.current;
    const seq = seqRef.current;
    try {
      const next = await fetchGuard();
      if (next && generation === generationRef.current && seq === seqRef.current) setGuard(next);
    } finally {
      inFlightRef.current = false;
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
      inFlightRef.current = false;
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
      } else {
        toastRef.current.toast.push({ title: toastRef.current.t('cooling.guard.error.toggle') });
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

  const undo = useCallback(async () => {
    applyHeal(await undoHeal());
  }, [applyHeal]);

  return { guard, toggling, refresh, toggle, undo, applyHeal };
}
