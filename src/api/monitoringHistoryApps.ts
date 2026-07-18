// Per-app window-scoped monitoring history - typed wrapper over the local
// service's GET /monitoring/history/apps?from=<utcMs>&to=<utcMs>&series=<cpu|
// gpu:gid|memory|net|vram>&process=<name>&maxApps=<n>&maxPoints=<n>, returning
// { supported, apps: [{ name, startedAtMs?, avg, max, points }] }. Feeds the
// process list's window-scoped values/sparklines AND the hero chart's hover
// tooltip (nearest-point lookup client-side - no per-hover fetching). `process`
// scopes the response to one named app (bypassing the top-N ranking) - used by
// the process-detail slideout's own per-metric usage tiles. The service route
// doesn't exist yet, so a 404 here falls back to contract-shaped mock data in
// a dev build; in a production build a 404 is reported as `unsupported`
// rather than an error, same contract as api/monitoringHistory.ts.

import { classifyFetchOutcome, requestJson } from './fetchOutcome';

export interface AppWindowPoint {
  t: number;
  avg: number;
}

export interface AppWindowSeries {
  name: string;
  /** UTC milliseconds the app was first observed running, when known. */
  startedAtMs?: number;
  avg: number;
  max: number;
  /** Window-average VRAM in MiB - populated only when `series` is `gpu` or
   *  `gpu:<adapterLuid>` and the app carried at least one VRAM sample in the
   *  window; null/omitted otherwise (every non-GPU series, or a GPU app with
   *  no VRAM reading). */
  vramAvgMb?: number | null;
  points: AppWindowPoint[];
}

export interface MetricHistoryAppsResponse {
  supported: boolean;
  apps: AppWindowSeries[];
}

export interface MetricHistoryAppsQuery {
  /** UTC milliseconds. */
  from: number;
  /** UTC milliseconds. */
  to: number;
  /** 'cpu' | 'memory' | 'net' | 'vram' | `gpu:${adapterLuid}`. */
  series: string;
  /** Scopes the response to this one app by name (case-insensitive),
   *  bypassing the top-N-by-usage ranking - omit for the ranked list. */
  process?: string;
  maxApps?: number;
  maxPoints?: number;
}

export interface MetricHistoryAppsFetchResult {
  data: MetricHistoryAppsResponse | null;
  mocked: boolean;
  /** True when the service returned 404 and no mock is available (production
   *  build) - the route isn't there, distinct from a real request failure. */
  unsupported: boolean;
}

function buildQuery(query: MetricHistoryAppsQuery): string {
  const params = new URLSearchParams();
  params.set('from', String(Math.round(query.from)));
  params.set('to', String(Math.round(query.to)));
  params.set('series', query.series);
  if (query.process) params.set('process', query.process);
  if (query.maxApps != null) params.set('maxApps', String(query.maxApps));
  if (query.maxPoints != null) params.set('maxPoints', String(query.maxPoints));
  return params.toString();
}

type MonitoringHistoryAppsMockModule = typeof import('./monitoringHistoryAppsMock');

const loadMonitoringHistoryAppsMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<MonitoringHistoryAppsMockModule> => import('./monitoringHistoryAppsMock')
  : null;

export async function fetchMonitoringHistoryApps(query: MetricHistoryAppsQuery): Promise<MetricHistoryAppsFetchResult> {
  const { data, status } = await requestJson<MetricHistoryAppsResponse>(`/monitoring/history/apps?${buildQuery(query)}`);
  const outcome = classifyFetchOutcome(data, status, loadMonitoringHistoryAppsMock !== null);
  switch (outcome) {
    case 'ok': return { data, mocked: false, unsupported: false };
    case 'mockFallback': {
      const mock = await loadMonitoringHistoryAppsMock!();
      return { data: mock.mockMonitoringHistoryApps(query), mocked: true, unsupported: false };
    }
    case 'unsupported': return { data: null, mocked: false, unsupported: true };
    case 'error': return { data: null, mocked: false, unsupported: false };
  }
}
