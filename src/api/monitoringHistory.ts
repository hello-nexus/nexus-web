// Monitoring history API client - typed wrapper over the local service's
// GET /monitoring/history (contract: plans/metrics-history.md in the parent
// repo). The service route doesn't exist yet, so a 404 here falls back to
// contract-shaped mock data in a dev build; any other failure (network
// down, 500) is a real error, not masked. The mock module is dynamically
// imported behind the raw build-define gate below so it never enters a
// production bundle - see api/diagnostics.ts for the same pattern.

import { authFetchWithStatus } from './service';

export type MetricHistoryKind =
  | 'cpu' | 'memory' | 'net' | 'gpu' | 'cpu-temp' | 'gpu-temp' | 'fan' | 'fan-duty';

export interface MetricHistoryPoint {
  t: number;
  avg: number;
  max: number;
}

export interface MetricHistorySeries {
  id: string;
  kind: MetricHistoryKind;
  name: string;
  adapterLuid?: string;
  points: MetricHistoryPoint[];
}

export interface MetricHistoryResponse {
  supported: boolean;
  retentionDays: number;
  stepSeconds: number;
  series: MetricHistorySeries[];
}

export interface MetricHistoryQuery {
  /** UTC milliseconds. */
  from: number;
  /** UTC milliseconds. */
  to: number;
  maxPoints?: number;
  /** CSV of full series ids and/or bare kinds (a bare kind matches every id of that kind). */
  series?: string;
}

export interface MetricHistoryFetchResult {
  data: MetricHistoryResponse | null;
  mocked: boolean;
}

function buildQuery(query: MetricHistoryQuery): string {
  const params = new URLSearchParams();
  params.set('from', String(Math.round(query.from)));
  params.set('to', String(Math.round(query.to)));
  if (query.maxPoints != null) params.set('maxPoints', String(query.maxPoints));
  if (query.series) params.set('series', query.series);
  return params.toString();
}

async function requestJson<T>(path: string): Promise<{ data: T | null; status: number }> {
  const { response, status } = await authFetchWithStatus(path);
  if (!response || !response.ok) return { data: null, status };
  try {
    return { data: (await response.json()) as T, status };
  } catch {
    return { data: null, status };
  }
}

type MonitoringHistoryMockModule = typeof import('./monitoringHistoryMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site. Keeps the mock's
// fixtures out of a production bundle.
const loadMonitoringHistoryMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<MonitoringHistoryMockModule> => import('./monitoringHistoryMock')
  : null;

export async function fetchMonitoringHistory(query: MetricHistoryQuery): Promise<MetricHistoryFetchResult> {
  const { data, status } = await requestJson<MetricHistoryResponse>(`/monitoring/history?${buildQuery(query)}`);
  if (data !== null) return { data, mocked: false };
  if (status === 404 && loadMonitoringHistoryMock) {
    const mock = await loadMonitoringHistoryMock();
    return { data: mock.mockMonitoringHistory(query), mocked: true };
  }
  return { data: null, mocked: false };
}
