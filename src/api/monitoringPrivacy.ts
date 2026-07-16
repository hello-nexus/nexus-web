// Monitoring privacy-access API client - typed wrapper over the local
// service's GET /monitoring/privacy?from=<utcMs>&to=<utcMs>, returning
// { supported, retentionDays, sessions }. Each session names the capability
// (webcam/microphone/location/screen-capture variant) an app used, when it
// started, and when it ended - end stays null while the capability is still
// in use. `app` is either a full win32 exe path or a package family name
// (Store app). Same dev-only 404 mock fallback as api/monitoringHistory.ts -
// see fetchOutcome.ts for the unsupported-vs-error distinction both share.

import { classifyFetchOutcome, requestJson } from './fetchOutcome';

export type PrivacyCapability =
  | 'webcam' | 'microphone' | 'location' | 'graphicsCaptureProgrammatic' | 'graphicsCaptureWithoutBorder';

export interface PrivacySession {
  /** Full win32 exe path, or a package family name for a Store app. */
  app: string;
  capability: PrivacyCapability;
  /** UTC milliseconds. */
  start: number;
  /** UTC milliseconds, or null while the capability is still in use. */
  end: number | null;
}

export interface PrivacyResponse {
  supported: boolean;
  retentionDays: number;
  sessions: PrivacySession[];
}

export interface PrivacyQuery {
  /** UTC milliseconds. */
  from: number;
  /** UTC milliseconds. */
  to: number;
}

export interface PrivacyFetchResult {
  data: PrivacyResponse | null;
  mocked: boolean;
  /** True when the service returned 404 and no mock is available (production
   *  build) - the route isn't there, distinct from a real request failure. */
  unsupported: boolean;
}

function buildQuery(query: PrivacyQuery): string {
  const params = new URLSearchParams();
  params.set('from', String(Math.round(query.from)));
  params.set('to', String(Math.round(query.to)));
  return params.toString();
}

type MonitoringPrivacyMockModule = typeof import('./monitoringPrivacyMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site. Keeps the mock's
// fixtures out of a production bundle.
const loadMonitoringPrivacyMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<MonitoringPrivacyMockModule> => import('./monitoringPrivacyMock')
  : null;

export async function fetchMonitoringPrivacy(query: PrivacyQuery): Promise<PrivacyFetchResult> {
  const { data, status } = await requestJson<PrivacyResponse>(`/monitoring/privacy?${buildQuery(query)}`);
  const outcome = classifyFetchOutcome(data, status, loadMonitoringPrivacyMock !== null);
  switch (outcome) {
    case 'ok': return { data, mocked: false, unsupported: false };
    case 'mockFallback': {
      const mock = await loadMonitoringPrivacyMock!();
      return { data: mock.mockMonitoringPrivacy(query), mocked: true, unsupported: false };
    }
    case 'unsupported': return { data: null, mocked: false, unsupported: true };
    case 'error': return { data: null, mocked: false, unsupported: false };
  }
}
