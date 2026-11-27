import { useCallback, useEffect, useState } from 'react';
import { fetchPawnIoStatus, type PawnIoStatus } from '../api/pawnio';
import { gateShows } from '../components/common/PawnIoGate/gateLogic';

const POLL_MS = 5_000;

/** A failed or unrecognized read keeps what was known: only a positive report moves the gate. */
export function nextPawnIoStatus(prev: PawnIoStatus | null, fetched: PawnIoStatus | null): PawnIoStatus | null {
  return fetched ?? prev;
}

/**
 * Driver gate state for the dashboard. Starts null (no gate) and never holds
 * the app on the read: one fetch when the service is online, then a poll
 * only while the gate shows. `celebrating` keeps the screen up for the
 * "Driver running" beat after a fix reaches ok.
 */
export function usePawnIoGate(enabled: boolean) {
  const [status, setStatus] = useState<PawnIoStatus | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const showing = gateShows(status);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      void fetchPawnIoStatus().then(next => {
        if (!cancelled) setStatus(prev => nextPawnIoStatus(prev, next));
      });
    };
    tick();
    if (!showing) return () => { cancelled = true; };
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, showing]);

  const onFixed = useCallback(() => setCelebrating(true), []);
  const onContinue = useCallback(() => setCelebrating(false), []);
  return { status, setStatus, show: showing || celebrating, onFixed, onContinue };
}
