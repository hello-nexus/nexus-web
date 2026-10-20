import { useCallback, useEffect, useRef, useState } from 'react';
import { pingService, type PingResponse } from '../api/service';
import { serviceAnsweredAt, type OfflineHold } from '../lib/serviceLiveness';
import { isLaunching, resolveLaunch, useLaunchState } from './useServiceLaunch';

/**
 * checking        - initial ping in flight
 * online          - service responding
 * offline-installed - ping failed, but we've connected before (service installed but not running)
 * offline         - ping failed, never connected (service not installed)
 */
export type ConnectionState = 'checking' | 'online' | 'offline-installed' | 'offline';

export interface ServiceStatus {
  state: ConnectionState;
  ping: PingResponse | null;
  retry: () => void;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_INTERVAL_LAUNCHING_MS = 500;
// Starved REST still completes within a ping cycle; silence longer than that
// reads as a lost link.
export const LIVENESS_WINDOW_MS = 2 * POLL_INTERVAL_MS;
export const INSTALLED_KEY = 'nexus_installed';

/**
 * @param enabled        poll while true
 * @param offlineGraceMs once the service has answered at least once this
 *   mount, require it to be continuously unreachable for this long before
 *   reporting an offline state; 0 (default) flips on the first failed ping.
 *   Never delays the boot path - with no good state to hold, the first
 *   failure surfaces offline immediately. Panels take theirs from
 *   panelOfflineGrace.
 * @param hold           when a miss inside the grace is held (see OfflineHold)
 */
export function useServiceStatus(enabled = true, offlineGraceMs = 0, hold: OfflineHold = 'always'): ServiceStatus {
  const [state, setState] = useState<ConnectionState>('checking');
  const [ping, setPing] = useState<PingResponse | null>(null);
  // True while a failed ping is being held inside the grace window.
  const [held, setHeld] = useState(false);
  const mounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  // Wall-clock ms of the first ping failure in the current unreachable streak,
  // or null while reachable; gates the offlineGraceMs hold.
  const firstFailureAtRef = useRef<number | null>(null);
  // The grace window holds the LAST GOOD state - it must never hold the boot
  // 'checking' blank: a service that is down at load time would otherwise
  // keep the page dark for the whole grace plus a poll cycle before the
  // offline gate can render.
  const wasOnlineRef = useRef(false);
  const launching = useLaunchState();
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const tick = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await pingService();
      if (!mounted.current) return;
      if (result) {
        firstFailureAtRef.current = null;
        wasOnlineRef.current = true;
        setHeld(false);
        setState('online');
        setPing(result);
        localStorage.setItem(INSTALLED_KEY, 'true');
        // Service is up - clear the launch spinner immediately so we don't
        // wait the full 10s timeout.
        resolveLaunch();
      } else {
        const now = Date.now();
        firstFailureAtRef.current ??= now;
        // Within the grace window, hold the last good state (and its ping data)
        // so a transient miss doesn't surface offline / tear down the editor.
        // Only when there IS a good state to hold: at boot the first failed
        // ping must surface offline immediately, not extend the blank frame.
        const mode = holdRef.current;
        const holds = mode === 'always' || (mode === 'while-live' && now - serviceAnsweredAt() < LIVENESS_WINDOW_MS);
        if (holds && wasOnlineRef.current && now - firstFailureAtRef.current < offlineGraceMs) {
          setHeld(true);
          return;
        }
        setHeld(false);
        setState(offlineState());
        setPing(null);
      }
    } finally {
      inFlightRef.current = false;
      if (mounted.current && enabled) {
        const interval = isLaunching() ? POLL_INTERVAL_LAUNCHING_MS : POLL_INTERVAL_MS;
        timerRef.current = setTimeout(tick, interval);
      }
    }
  }, [enabled, offlineGraceMs]);

  const retry = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void tick();
  }, [enabled, tick]);

  useEffect(() => {
    if (!enabled) return undefined;
    mounted.current = true;
    void tick();
    return () => {
      mounted.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, tick]);

  // When launching flips on, immediately reschedule the next poll for the
  // short interval rather than letting the existing 5s timer run out first.
  useEffect(() => {
    if (!enabled || !launching) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void tick();
  }, [enabled, launching, tick]);

  // A hold that loses its condition stays offline until a ping answers.
  useEffect(() => {
    if (!held || hold !== 'never') return;
    setHeld(false);
    setState(offlineState());
    setPing(null);
  }, [held, hold]);

  if (held && hold === 'never') return { state: offlineState(), ping: null, retry };
  return { state, ping, retry };
}

function offlineState(): ConnectionState {
  return localStorage.getItem(INSTALLED_KEY) === 'true' ? 'offline-installed' : 'offline';
}
