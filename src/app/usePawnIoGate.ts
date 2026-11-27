import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPawnIoStatus, type PawnIoStatus } from '../api/pawnio';
import { gateShows } from '../components/common/PawnIoGate/gateLogic';

const POLL_MS = 5_000;
// The service's boot check latches some seconds after it starts, so a window
// opened before then polls for a bounded time after each transition to online.
export const BOOT_POLL_WINDOW_MS = 120_000;

/** A failed or unrecognized read keeps what was known: only a positive report moves the gate. */
export function nextPawnIoStatus(prev: PawnIoStatus | null, fetched: PawnIoStatus | null): PawnIoStatus | null {
  return fetched ?? prev;
}

/**
 * Driver gate state for the dashboard. Starts null (no gate) and never holds
 * the app on the read: a fetch when the service comes online, polled for a
 * bounded window after that and while the gate shows. `celebrating` keeps the screen up for the
 * "Driver running" beat after a fix reaches ok.
 */
export function usePawnIoGate(enabled: boolean) {
  const [status, setStatus] = useState<PawnIoStatus | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const showing = gateShows(status);

  const onlineSince = useRef(0);

  // Going offline ends a success beat: the screen it was held for is gone,
  // and on reconnect the fresh read decides whether the gate shows.
  useEffect(() => {
    if (enabled) onlineSince.current = Date.now();
    else setCelebrating(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      void fetchPawnIoStatus().then(next => {
        if (!cancelled) setStatus(prev => nextPawnIoStatus(prev, next));
      });
    };
    tick();
    const id = setInterval(() => {
      if (!showing && Date.now() - onlineSince.current >= BOOT_POLL_WINDOW_MS) {
        clearInterval(id);
        return;
      }
      tick();
    }, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, showing]);

  const onFixed = useCallback(() => setCelebrating(true), []);
  const onContinue = useCallback(() => setCelebrating(false), []);
  return { status, setStatus, show: showing || celebrating, onFixed, onContinue };
}
