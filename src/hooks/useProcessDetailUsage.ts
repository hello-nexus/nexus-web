import { useMetricHistoryApps, type UseMetricHistoryAppsResult } from './useMetricHistoryApps';
import type { HistoryMetric } from '../panel/widgets/monitoring/page/metricHistoryHelpers';

export interface ProcessDetailUsage {
  cpu: UseMetricHistoryAppsResult;
  memory: UseMetricHistoryAppsResult;
  gpu: UseMetricHistoryAppsResult;
  vram: UseMetricHistoryAppsResult;
  /** Read/write breakdown of the combined 'storage' series - fetched only
   *  while `metric` is 'storage', since it's meaningless on every other tab. */
  storageRead: UseMetricHistoryAppsResult;
  storageWrite: UseMetricHistoryAppsResult;
  /** Download/upload breakdown of the combined 'net' series - fetched only
   *  while `metric` is 'network'. */
  netDown: UseMetricHistoryAppsResult;
  netUp: UseMetricHistoryAppsResult;
}

/**
 * Per-process CPU/memory/GPU/VRAM window series for the process-detail
 * slideout's usage tiles (the `process=<name>` filter on GET
 * /monitoring/history/apps) - independent of whichever metric the active
 * monitoring tab itself is plotting, so all four tiles stay populated
 * regardless of which tab the slideout was opened from. The storage read/
 * write and network down/up splits are narrower - each pair is only ever
 * relevant on its own tab, so they're gated on `metric` rather than always on.
 *
 * `enabled` is the caller's own "is the selected frame actually live"
 * decision (following AND nothing pinned) - NOT the raw `following` flag.
 * A plain click on the hero chart (no drag) pins a past frame without ever
 * flipping `following` (see TimeSeriesChart's onPointClick vs onRangeSelect),
 * so gating on `following` alone would leave the tiles frozen on the raw
 * `live` prop (right-now's value) while the slideout's own label says "As of
 * <past time>". `following` is still passed through separately - it only
 * drives useMetricHistoryApps's tick-slide-skip, which stays correct
 * (the window keeps sliding with the live edge) independently of whether a
 * frame within it happens to be pinned. The storage/network splits are NOT
 * gated on `enabled`: they have no push-driven live counterpart (unlike cpu/
 * memory/gpu/vram, which read `live` while isLive), so they must keep
 * fetching through the live state too or the tiles would never populate
 * while following.
 */
export function useProcessDetailUsage(
  name: string, from: number, to: number, enabled: boolean, following: boolean, metric: HistoryMetric,
): ProcessDetailUsage {
  const cpu = useMetricHistoryApps(enabled, 'cpu', from, to, following, name);
  const memory = useMetricHistoryApps(enabled, 'memory', from, to, following, name);
  const gpu = useMetricHistoryApps(enabled, 'gpu', from, to, following, name);
  const vram = useMetricHistoryApps(enabled, 'vram', from, to, following, name);
  const storageRead = useMetricHistoryApps(metric === 'storage', 'storage-read', from, to, following, name);
  const storageWrite = useMetricHistoryApps(metric === 'storage', 'storage-write', from, to, following, name);
  const netDown = useMetricHistoryApps(metric === 'network', 'net-down', from, to, following, name);
  const netUp = useMetricHistoryApps(metric === 'network', 'net-up', from, to, following, name);
  return { cpu, memory, gpu, vram, storageRead, storageWrite, netDown, netUp };
}
