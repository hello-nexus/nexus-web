import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory, type MetricHistoryResponse, type MetricHistorySeries } from '../api/monitoringHistory';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

// Trailing window fetched on bootstrap/reconnect - wide enough that a
// single missed sample still leaves the newest point inside it, narrow
// enough to stay a cheap one-off request.
const LOOKBACK_MS = 5_000;
const MAX_POINTS = 10;

/** The last point's avg for one series id, or null when that series is
 *  absent or reported no point in this response/frame. */
function lastAvg(series: readonly MetricHistorySeries[], id: string): number | null {
  const s = series.find(x => x.id === id);
  if (!s || s.points.length === 0) return null;
  return s.points[s.points.length - 1].avg;
}

/**
 * Total disk read+write rate (bytes/sec) for the monitoring tab-chip,
 * mirroring the always-on cpu/memory/network page-level reads in
 * MonitoringPage. Bootstraps from one GET /monitoring/history fetch (on
 * enable and on socket reconnect) then tracks the 'monitoring/history-tail'
 * push instead of polling: each frame's disk-read/disk-write points update
 * the matching half of the rate, and a half reporting no point that tick
 * leaves its last known value in place rather than dropping to 0. The
 * caller passes `enabled=false` while the Storage tab itself is active,
 * since that tab's own useMetricHistory instance already fetches the same
 * series for the chart - see currentDiskRateBytesPerSec's own doc for that
 * direct path.
 */
export function useDiskIoRate(enabled: boolean): number {
  const [rate, setRate] = useState(0);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);
  const lastReadRef = useRef(0);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const bootstrap = useCallback(() => {
    const seq = ++seqRef.current;
    const to = Date.now();
    void (async () => {
      const result = await fetchMonitoringHistory({
        from: to - LOOKBACK_MS, to, maxPoints: MAX_POINTS, series: 'disk-read,disk-write',
      });
      if (!mountedRef.current || seq !== seqRef.current || !result.data) return;
      lastReadRef.current = lastAvg(result.data.series, 'disk-read') ?? lastReadRef.current;
      lastWriteRef.current = lastAvg(result.data.series, 'disk-write') ?? lastWriteRef.current;
      setRate(lastReadRef.current + lastWriteRef.current);
    })();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRate(0);
      lastReadRef.current = 0;
      lastWriteRef.current = 0;
      return;
    }
    bootstrap();
  }, [enabled, bootstrap]);

  // Reconnect: a dropped socket misses whatever pushed while it was down -
  // resync with one fetch. Edge-detected off `connected` (no reconnect
  // counter on the multiplex context, matching the other monitoring hooks).
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && connected && !prevConnectedRef.current) bootstrap();
    prevConnectedRef.current = connected;
  }, [enabled, connected, bootstrap]);

  useTopicCallback('monitoring/history-tail', enabled, (raw) => {
    const payload = raw as MetricHistoryResponse | null;
    if (!payload) return;
    const read = lastAvg(payload.series, 'disk-read');
    const write = lastAvg(payload.series, 'disk-write');
    if (read === null && write === null) return;
    if (read !== null) lastReadRef.current = read;
    if (write !== null) lastWriteRef.current = write;
    setRate(lastReadRef.current + lastWriteRef.current);
  });

  return rate;
}
