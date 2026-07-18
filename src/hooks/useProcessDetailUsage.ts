import { useMetricHistoryApps, type UseMetricHistoryAppsResult } from './useMetricHistoryApps';

export interface ProcessDetailUsage {
  cpu: UseMetricHistoryAppsResult;
  memory: UseMetricHistoryAppsResult;
  gpu: UseMetricHistoryAppsResult;
  vram: UseMetricHistoryAppsResult;
}

/**
 * Per-process CPU/memory/GPU/VRAM window series for the process-detail
 * slideout's usage tiles (the `process=<name>` filter on GET
 * /monitoring/history/apps) - independent of whichever metric the active
 * monitoring tab itself is plotting, so all four tiles stay populated
 * regardless of which tab the slideout was opened from.
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
 * frame within it happens to be pinned.
 */
export function useProcessDetailUsage(name: string, from: number, to: number, enabled: boolean, following: boolean): ProcessDetailUsage {
  const cpu = useMetricHistoryApps(enabled, 'cpu', from, to, following, name);
  const memory = useMetricHistoryApps(enabled, 'memory', from, to, following, name);
  const gpu = useMetricHistoryApps(enabled, 'gpu', from, to, following, name);
  const vram = useMetricHistoryApps(enabled, 'vram', from, to, following, name);
  return { cpu, memory, gpu, vram };
}
