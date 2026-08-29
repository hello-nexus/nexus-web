// Monitoring history API client - typed wrapper over the local service's
// GET /monitoring/history?from=<utcMs>&to=<utcMs>&maxPoints=<n>&series=<csv>,
// returning { supported, retentionDays, stepSeconds, series }. The service
// route doesn't exist yet, so a 404 here falls back to contract-shaped mock
// data in a dev build; in a production build (no mock available) a 404 is
// reported as `unsupported` rather than an error, since a service that
// predates this route is a normal deployment state, not a failure.
// Any other failure (network down, 500) is a real error, not masked. The
// mock module is dynamically imported behind the raw build-define gate below
// so it never enters a production bundle - see api/diagnostics.ts for the
// same pattern.

import { deleteService } from './service';
import { classifyFetchOutcome, requestJson } from './fetchOutcome';

export type MetricHistoryKind =
  | 'cpu' | 'memory' | 'net' | 'disk' | 'gpu' | 'cpu-temp' | 'gpu-temp' | 'mem-temp' | 'drive-temp' | 'fan' | 'fan-duty' | 'fps';

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
  /** True when the service returned 404 and no mock is available (production
   *  build) - the route isn't there, distinct from a real request failure. */
  unsupported: boolean;
}

function buildQuery(query: MetricHistoryQuery): string {
  const params = new URLSearchParams();
  params.set('from', String(Math.round(query.from)));
  params.set('to', String(Math.round(query.to)));
  if (query.maxPoints != null) params.set('maxPoints', String(query.maxPoints));
  if (query.series) params.set('series', query.series);
  return params.toString();
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
  const outcome = classifyFetchOutcome(data, status, loadMonitoringHistoryMock !== null);
  switch (outcome) {
    case 'ok': return { data, mocked: false, unsupported: false };
    case 'mockFallback': {
      const mock = await loadMonitoringHistoryMock!();
      return { data: mock.mockMonitoringHistory(query), mocked: true, unsupported: false };
    }
    case 'unsupported': return { data: null, mocked: false, unsupported: true };
    case 'error': return { data: null, mocked: false, unsupported: false };
  }
}

export interface DeleteMonitoringHistoryResult {
  deleted: number;
}

/** Purges every ring/segment store this route owns (Privacy & Data's Local
 *  data store section); recording resumes on the next sample. */
export const deleteMonitoringHistory = () =>
  deleteService<DeleteMonitoringHistoryResult>('/monitoring/history');
