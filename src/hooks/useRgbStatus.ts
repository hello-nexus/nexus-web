import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * Tracks the bundled openrgb-headless subprocess state and rescan flag.
 *
 * Push-driven for steady-state: every /lighting/* mutation publishes a
 * 'lighting' frame, which is when the most-likely state change happens (user
 * started an effect that triggered the RGB process to start, etc.).
 *
 * Polled while scanning: rescan completion isn't a /lighting/* mutation, so
 * there's no topic frame to tell us it finished. Without a fallback the
 * "Rescanning..." label stuck until the next unrelated event or a tab change.
 * Once `scanning` flips true (boot, user-triggered rescan, or USB topology
 * change), the hook polls every 1s until it flips false, then drops back to
 * push-only.
 */
interface LightingStatusResponse {
  rgbRunning: boolean;
  scanning: boolean;
}

export interface RgbStatus {
  running: boolean;
  scanning: boolean;
}

export function useRgbStatus(enabled: boolean): RgbStatus {
  const [status, setStatus] = useState<RgbStatus>({ running: false, scanning: false });
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    const r = await fetchService<LightingStatusResponse>('/lighting/status');
    if (!mounted.current) return;
    setStatus({ running: r?.rgbRunning ?? false, scanning: r?.scanning ?? false });
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setStatus({ running: false, scanning: false });
      return () => { mounted.current = false; };
    }
    void fetchStatus();
    return () => {
      mounted.current = false;
    };
  }, [enabled, fetchStatus]);

  useTopicCallback('lighting', enabled, () => {
    void fetchStatus();
  });

  // Poll while scanning: see the file header for why this exists. Cleared as
  // soon as scanning flips false so we're back to zero background work.
  useEffect(() => {
    if (!enabled || !status.scanning) return;
    const id = setInterval(fetchStatus, 1000);
    return () => clearInterval(id);
  }, [enabled, status.scanning, fetchStatus]);

  return status;
}
