import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory, type MetricHistoryResponse, type MetricHistorySeries } from '../api/monitoringHistory';
import { useMultiplex, useTopicCallback } from './useMultiplexSocket';

// Trailing window fetched on bootstrap/reconnect - wide enough that a
// single missed sample still leaves the newest point inside it, narrow
// enough to stay a cheap one-off request.
const LOOKBACK_MS = 5_000;
const MAX_POINTS = 10;
// Consecutive push ticks (roughly 1Hz) a half can go with no fresh point
// before it decays to 0, rather than holding its last known value forever -
// matches the old poll's own LOOKBACK_MS window, where a point older than
// 5s naturally fell out and read as 0.
const EMPTY_TICKS_BEFORE_ZERO = 5;

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
 * the matching half of the rate; a half with no point that tick carries its
 * last known value forward, decaying to 0 after EMPTY_TICKS_BEFORE_ZERO
 * consecutive empty ticks rather than holding a stale value indefinitely.
 * The caller passes `enabled=false` while the Storage tab itself is active,
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
  const readEmptyTicksRef = useRef(0);
  const writeEmptyTicksRef = useRef(0);
  // True for the span between a bootstrap() call starting and its response
  // committing - gates the reconnect effect below so it doesn't fire a
  // redundant concurrent fetch while the initial bootstrap (racing the
  // socket's own first open) is still in flight.
  const bootstrapInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const bootstrap = useCallback(() => {
    const seq = ++seqRef.current;
    bootstrapInFlightRef.current = true;
    const to = Date.now();
    void (async () => {
      const result = await fetchMonitoringHistory({
        from: to - LOOKBACK_MS, to, maxPoints: MAX_POINTS, series: 'disk-read,disk-write',
      });
      if (!mountedRef.current || seq !== seqRef.current) return;
      bootstrapInFlightRef.current = false;
      if (!result.data) return;
      // Authoritative over the same LOOKBACK_MS window the old poll used -
      // no point found means genuinely no activity in that window, so this
      // resets (not carries forward) a half with nothing in it.
      readEmptyTicksRef.current = 0;
      writeEmptyTicksRef.current = 0;
      lastReadRef.current = lastAvg(result.data.series, 'disk-read') ?? 0;
      lastWriteRef.current = lastAvg(result.data.series, 'disk-write') ?? 0;
      setRate(lastReadRef.current + lastWriteRef.current);
    })();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRate(0);
      lastReadRef.current = 0;
      lastWriteRef.current = 0;
      readEmptyTicksRef.current = 0;
      writeEmptyTicksRef.current = 0;
      return;
    }
    bootstrap();
  }, [enabled, bootstrap]);

  // Reconnect: a dropped socket misses whatever pushed while it was down -
  // resync with one fetch. Edge-detected off `connected` (no reconnect
  // counter on the multiplex context, matching the other monitoring hooks).
  // Skipped while the bootstrap fetch is already in flight.
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (enabled && connected && !prevConnectedRef.current && !bootstrapInFlightRef.current) bootstrap();
    prevConnectedRef.current = connected;
  }, [enabled, connected, bootstrap]);

  useTopicCallback('monitoring/history-tail', enabled, (raw) => {
    const payload = raw as MetricHistoryResponse | null;
    if (!payload) return;
    const read = lastAvg(payload.series, 'disk-read');
    const write = lastAvg(payload.series, 'disk-write');
    let changed = false;
    if (read !== null) {
      lastReadRef.current = read;
      readEmptyTicksRef.current = 0;
      changed = true;
    } else if (readEmptyTicksRef.current < EMPTY_TICKS_BEFORE_ZERO) {
      readEmptyTicksRef.current++;
      if (readEmptyTicksRef.current === EMPTY_TICKS_BEFORE_ZERO && lastReadRef.current !== 0) {
        lastReadRef.current = 0;
        changed = true;
      }
    }
    if (write !== null) {
      lastWriteRef.current = write;
      writeEmptyTicksRef.current = 0;
      changed = true;
    } else if (writeEmptyTicksRef.current < EMPTY_TICKS_BEFORE_ZERO) {
      writeEmptyTicksRef.current++;
      if (writeEmptyTicksRef.current === EMPTY_TICKS_BEFORE_ZERO && lastWriteRef.current !== 0) {
        lastWriteRef.current = 0;
        changed = true;
      }
    }
    if (changed) setRate(lastReadRef.current + lastWriteRef.current);
  });

  return rate;
}
