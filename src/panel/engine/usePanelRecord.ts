import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPanelDeviceWithStatus, type PanelDeviceRecord } from '../../api/panel';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';

const RETRY_MS = [2000, 4000, 8000];

export interface PanelRecordState {
  record: PanelDeviceRecord | null;
  /** The first fetch settled, so the panel can render against what it knows. */
  loaded: boolean;
  /** The server has no such record (404); writes stay off until it returns. */
  missing: boolean;
  refetch: () => void;
}

export const INERT_PANEL_RECORD: PanelRecordState = {
  record: null,
  loaded: true,
  missing: false,
  refetch: () => {},
};

/**
 * This panel's device record - the single source for its surface, layout and
 * theme. Kept fresh by the `panel/device` topic the service broadcasts on
 * every write; an unreachable service is retried with backoff and never
 * replaces a record already in hand with defaults.
 */
export function usePanelRecord(deviceId: string | null): PanelRecordState {
  const [record, setRecord] = useState<PanelDeviceRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  // Only the newest read may settle state or schedule a retry; an overlapping
  // one (the reconnect edge landing on a slow mount fetch) would otherwise
  // leave a second retry chain running.
  const generation = useRef(0);

  const fetchRecord = useCallback(() => {
    if (!deviceId) {
      setLoaded(true);
      return;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    const mine = ++generation.current;
    const retryLater = () => {
      if (mine !== generation.current) return;
      const delay = RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)];
      retryTimer.current = setTimeout(fetchRecord, delay);
      setLoaded(true);
    };
    void fetchPanelDeviceWithStatus(deviceId).then(result => {
      if (mine !== generation.current) return;
      if (result.found) {
        attempt.current = 0;
        setRecord(result.record);
        setMissing(false);
      } else if (result.status === 404) {
        attempt.current = 0;
        setMissing(true);
      } else {
        retryLater();
        return;
      }
      setLoaded(true);
    }).catch(retryLater);
  }, [deviceId]);

  useEffect(() => {
    fetchRecord();
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [fetchRecord]);

  useTopicCallback('panel/device', true, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    if (frame?.deviceId === deviceId) fetchRecord();
  });

  return { record, loaded, missing, refetch: fetchRecord };
}
