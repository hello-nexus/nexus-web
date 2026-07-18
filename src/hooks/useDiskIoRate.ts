import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMonitoringHistory } from '../api/monitoringHistory';
import { currentDiskRateBytesPerSec } from '../panel/widgets/monitoring/page/metricHistoryHelpers';

const POLL_MS = 1_000;
// Trailing window polled each tick - wide enough that a single missed sample
// still leaves the newest point inside it, narrow enough to stay a cheap
// per-tick request.
const LOOKBACK_MS = 5_000;
const MAX_POINTS = 10;

/**
 * Total disk read+write rate (bytes/sec) for the monitoring tab-chip,
 * mirroring the always-on cpu/memory/network page-level reads in
 * MonitoringPage. Unlike those, the service has no live-pushed disk
 * throughput topic (GET /monitoring/history's disk-read/disk-write series
 * is the only source), so this polls a short trailing window directly
 * instead of depending on whichever tab's own useMetricHistory instance
 * happens to be fetching that series. The caller passes `enabled=false`
 * while the Storage tab itself is active, since that tab's own
 * useMetricHistory instance already fetches the same series for the chart -
 * see currentDiskRateBytesPerSec's own doc for that direct path.
 */
export function useDiskIoRate(enabled: boolean): number {
  const [rate, setRate] = useState(0);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const poll = useCallback(() => {
    const seq = ++seqRef.current;
    const to = Date.now();
    void (async () => {
      const result = await fetchMonitoringHistory({
        from: to - LOOKBACK_MS, to, maxPoints: MAX_POINTS, series: 'disk-read,disk-write',
      });
      if (!mountedRef.current || seq !== seqRef.current || !result.data) return;
      setRate(currentDiskRateBytesPerSec(result.data.series));
    })();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRate(0);
      return;
    }
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, poll]);

  return rate;
}
