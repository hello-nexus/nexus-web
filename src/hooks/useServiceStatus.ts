import { useCallback, useEffect, useRef, useState } from 'react';
import { pingService, type PingResponse } from '../api/service';
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
export const INSTALLED_KEY = 'nexus_installed';

// Grace before a host-display panel declares the local service offline. A
// host-display surface (Y70/monitor) is the host's own screen - it can't be
// unplugged as a normal action, so a single failed /ping is almost always a
// transient hiccup (e.g. the ping starved behind a burst of slow /shortcuts/icon
// requests while browsing apps in the deck editor), not a real outage. Flipping
// offline on the first miss tears down an open editor (PanelApp's isOffline
// effect), so a host-display panel holds its last good state until the service
// is unreachable this long. Cabled surfaces (q60, USB phone) deliberately keep
// the instant-offline path: pulling the cable is a real user-initiated
// disconnect that should surface right away.
export const HOST_DISPLAY_OFFLINE_GRACE_MS = 30_000;

/**
 * @param enabled        poll while true
 * @param offlineGraceMs require the service to be continuously unreachable for
 *   this long before reporting an offline state; 0 (default) flips on the first
 *   failed ping. Pass HOST_DISPLAY_OFFLINE_GRACE_MS for host-display panels.
 */
export function useServiceStatus(enabled = true, offlineGraceMs = 0): ServiceStatus {
  const [state, setState] = useState<ConnectionState>('checking');
  const [ping, setPing] = useState<PingResponse | null>(null);
  const mounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  // Wall-clock ms of the first ping failure in the current unreachable streak,
  // or null while reachable; gates the offlineGraceMs hold.
  const firstFailureAtRef = useRef<number | null>(null);
  const launching = useLaunchState();

  const tick = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await pingService();
      if (!mounted.current) return;
      if (result) {
        firstFailureAtRef.current = null;
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
        if (now - firstFailureAtRef.current < offlineGraceMs) return;
        const wasInstalled = localStorage.getItem(INSTALLED_KEY) === 'true';
        setState(wasInstalled ? 'offline-installed' : 'offline');
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

  return { state, ping, retry };
}
