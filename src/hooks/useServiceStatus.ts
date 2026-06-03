import { useCallback, useEffect, useRef, useState } from 'react';
import { pingService, type PingResponse } from '../api/service';
import { isLaunching, resolveLaunch, useLaunchState } from './useServiceLaunch';

/**
 * checking        — initial ping in flight
 * online          — service responding
 * offline-installed — ping failed, but we've connected before (service installed but not running)
 * offline         — ping failed, never connected (service not installed)
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

export function useServiceStatus(enabled = true): ServiceStatus {
  const [state, setState] = useState<ConnectionState>('checking');
  const [ping, setPing] = useState<PingResponse | null>(null);
  const mounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const launching = useLaunchState();

  const tick = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await pingService();
      if (!mounted.current) return;
      if (result) {
        setState('online');
        setPing(result);
        localStorage.setItem(INSTALLED_KEY, 'true');
        // Service is up - clear the launch spinner immediately so we don't
        // wait the full 10s timeout.
        resolveLaunch();
      } else {
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
  }, [enabled]);

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
