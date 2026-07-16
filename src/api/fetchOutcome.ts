// Shared plumbing for the "dev-mock fallback on 404" idiom used by
// api/monitoringHistory.ts and api/monitoringPrivacy.ts: a plain GET-and-
// parse-JSON helper plus classification of the result that distinguishes a
// route that's missing entirely (404, no mock available - a production
// build talking to a service that predates the route) from a real request
// failure, so callers can surface `unsupported` instead of masking it as an
// error. See api/diagnostics.ts for the sibling withMockFallback pattern
// (its own requestJson also supports non-GET methods, which neither
// consumer here needs).

import { authFetchWithStatus } from './service';

export async function requestJson<T>(path: string): Promise<{ data: T | null; status: number }> {
  const { response, status } = await authFetchWithStatus(path);
  if (!response || !response.ok) return { data: null, status };
  try {
    return { data: (await response.json()) as T, status };
  } catch {
    return { data: null, status };
  }
}

export type FetchOutcome = 'ok' | 'mockFallback' | 'unsupported' | 'error';

export function classifyFetchOutcome(data: unknown, status: number, mockAvailable: boolean): FetchOutcome {
  if (data !== null) return 'ok';
  if (status === 404) return mockAvailable ? 'mockFallback' : 'unsupported';
  return 'error';
}
