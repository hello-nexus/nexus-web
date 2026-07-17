// Per-process metadata for the process-detail slideout - typed wrapper over
// the local service's GET /monitoring/process-info?name=<processName>,
// returning { supported, name, path, instanceCount, startedAtMs, description,
// version, company, publisher, signed, sha256, createdAtMs, modifiedAtMs,
// firstSeenMs }. The service route is on a parallel branch, so a 404 here
// falls back to contract-shaped mock data in a dev build; in a production
// build a 404 is reported as `unsupported` rather than an error, same
// contract as api/monitoringHistory.ts.

import { classifyFetchOutcome, requestJson } from './fetchOutcome';

export interface ProcessInfoResponse {
  supported: boolean;
  name: string;
  /** Full path to the executable, when resolvable. */
  path?: string;
  instanceCount: number;
  /** UTC milliseconds the process (or its most recent instance) started. */
  startedAtMs?: number;
  description?: string;
  version?: string;
  company?: string;
  publisher?: string;
  signed?: boolean;
  sha256?: string;
  /** UTC milliseconds, from the file's filesystem metadata. */
  createdAtMs?: number;
  /** UTC milliseconds, from the file's filesystem metadata. */
  modifiedAtMs?: number;
  /** UTC milliseconds this process name was first observed by the service. */
  firstSeenMs?: number;
}

export interface ProcessInfoFetchResult {
  data: ProcessInfoResponse | null;
  mocked: boolean;
  /** True when the service returned 404 and no mock is available (production
   *  build) - the route isn't there, distinct from a real request failure. */
  unsupported: boolean;
}

type MonitoringProcessInfoMockModule = typeof import('./monitoringProcessInfoMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site - see
// api/monitoringHistory.ts for the same pattern.
const loadMonitoringProcessInfoMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<MonitoringProcessInfoMockModule> => import('./monitoringProcessInfoMock')
  : null;

export async function fetchMonitoringProcessInfo(name: string): Promise<ProcessInfoFetchResult> {
  const { data, status } = await requestJson<ProcessInfoResponse>(`/monitoring/process-info?name=${encodeURIComponent(name)}`);
  const outcome = classifyFetchOutcome(data, status, loadMonitoringProcessInfoMock !== null);
  switch (outcome) {
    case 'ok': return { data, mocked: false, unsupported: false };
    case 'mockFallback': {
      const mock = await loadMonitoringProcessInfoMock!();
      return { data: mock.mockMonitoringProcessInfo(name), mocked: true, unsupported: false };
    }
    case 'unsupported': return { data: null, mocked: false, unsupported: true };
    case 'error': return { data: null, mocked: false, unsupported: false };
  }
}
