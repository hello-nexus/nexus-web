import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * Tracks the bundled openrgb-headless subprocess state and rescan flag.
 *
 * Push-driven: every /lighting/* mutation publishes a 'lighting' frame,
 * which is when the most-likely state change happens (user started an effect
 * that triggered the RGB process to start, etc.). Autonomous RGB events
 * (rescan triggered by USB topology change with no user action) won't push
 * today; they'd need a dedicated rgb/status topic. Acceptable trade-off:
 * those events are rare and the spinner self-corrects on the next
 * mutation. Removes the prior 2s setInterval poll.
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

  return status;
}
