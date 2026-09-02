// Monitoring timeline events API client - typed wrapper over the local
// service's GET/POST/DELETE /monitoring/events (contract:
// plans/monitoring-event-pins.md). Same dev-only 404-mock-fallback idiom as
// api/monitoringHistory.ts / api/monitoringPrivacy.ts.
//
// Privacy-access sessions (webcam/microphone/location/screen) are NOT part
// of this store - they arrive via the existing api/monitoringPrivacy.ts and
// are merged into the timeline web-side (see hooks/useMonitoringEvents.ts).

import { classifyFetchOutcome } from './fetchOutcome';
import { authFetchWithStatus } from './service';

/** Kinds the service event log actually stores. */
export type StoredEventKind = 'app-open' | 'uac-escalation' | 'usb-attach' | 'usb-detach' | 'custom';
/** Web-only kinds derived from privacy-access sessions - never appear in a
 *  MonitoringEventDto and never round-trip through the service. */
export type PrivacyEventKind = 'privacy-webcam' | 'privacy-microphone' | 'privacy-location' | 'privacy-screen';
export type MonitoringEventKind = StoredEventKind | PrivacyEventKind;

/** Stable display order for every kind - shared by the settings toggle list
 *  and the chart's kind->icon map. */
export const MONITORING_EVENT_KINDS: MonitoringEventKind[] = [
  'app-open', 'uac-escalation', 'usb-attach', 'usb-detach',
  'privacy-webcam', 'privacy-microphone', 'privacy-location', 'privacy-screen',
  'custom',
];

/** Wire shape of GET /monitoring/events. `detail` is `null` on GET but the
 *  key is absent on the POST response, so it is optional AND nullable -
 *  fetchMonitoringEvents/createCustomEvent normalise a missing key to
 *  `null` before returning, so every other consumer only ever sees one of
 *  the two states. */
export interface MonitoringEventDto {
  id: number;
  /** UTC epoch milliseconds - same base as /monitoring/history. */
  t: number;
  /** Wire-typed as a plain string (not MonitoringEventKind) so an older
   *  client tolerates a future kind - EventKindsHidden's own "unknown kinds
   *  default to visible" rule depends on this staying lax. */
  kind: string;
  label: string;
  detail?: string | null;
  /** True only for a user-created event (POST /monitoring/events) - only
   *  these are deletable. */
  custom: boolean;
}

/** One event as the UI consumes it: stored events and privacy sessions
 *  normalised into a single shape. */
export interface TimelineEvent {
  /** Stored events use the service id. Privacy events are derived and have
   *  no service id, so they get a synthetic stable key instead. */
  key: string;
  /** Service id; null for derived privacy events (never deletable). */
  id: number | null;
  t: number;
  kind: MonitoringEventKind;
  label: string;
  detail: string | null;
  custom: boolean;
  /** Privacy sessions only: session end, or null while still in use.
   *  Always null for stored events. */
  endT: number | null;
}

export interface MonitoringEventsResponse {
  events: MonitoringEventDto[];
}

interface RequestOpts {
  method?: string;
  body?: unknown;
}

// Local requestJson (rather than fetchOutcome.ts's shared GET-only one)
// because createCustomEvent needs a POST body - same split as
// api/diagnostics.ts's own local requestJson alongside the shared
// classifyFetchOutcome.
async function requestJson<T>(path: string, opts?: RequestOpts): Promise<{ data: T | null; status: number }> {
  const { response, status } = await authFetchWithStatus(path, opts);
  if (!response || !response.ok) return { data: null, status };
  try {
    return { data: (await response.json()) as T, status };
  } catch {
    return { data: null, status };
  }
}

/** Exported so the 'monitoring/events' push handler (useMonitoringEvents.ts)
 *  normalises a pushed frame the same way a GET response is normalised. */
export function normaliseEventDto(dto: MonitoringEventDto): MonitoringEventDto {
  return { ...dto, detail: dto.detail ?? null };
}

type MonitoringEventsMockModule = typeof import('./monitoringEventsMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site. Keeps the mock's
// fixtures out of a production bundle.
const loadMonitoringEventsMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<MonitoringEventsMockModule> => import('./monitoringEventsMock')
  : null;

function buildQuery(from: number, to: number, limit?: number): string {
  const params = new URLSearchParams();
  params.set('from', String(Math.round(from)));
  params.set('to', String(Math.round(to)));
  if (limit != null) params.set('limit', String(limit));
  return params.toString();
}

export async function fetchMonitoringEvents(from: number, to: number, limit?: number): Promise<MonitoringEventDto[]> {
  const { data, status } = await requestJson<MonitoringEventsResponse>(`/monitoring/events?${buildQuery(from, to, limit)}`);
  const outcome = classifyFetchOutcome(data, status, loadMonitoringEventsMock !== null);
  switch (outcome) {
    case 'ok':
      return data!.events.map(normaliseEventDto);
    case 'mockFallback': {
      const mock = await loadMonitoringEventsMock!();
      return mock.mockMonitoringEvents({ from, to, limit }).events.map(normaliseEventDto);
    }
    case 'unsupported':
    case 'error':
      throw new Error(`fetchMonitoringEvents failed: status ${status}`);
  }
}

/** label is sent verbatim - the service trims, rejects empty (400), and
 *  truncates past 120 chars; the client doesn't duplicate that validation. */
export async function createCustomEvent(t: number, label: string): Promise<MonitoringEventDto> {
  const { data, status } = await requestJson<{ event: MonitoringEventDto }>(
    '/monitoring/events', { method: 'POST', body: { t, label } },
  );
  const outcome = classifyFetchOutcome(data, status, loadMonitoringEventsMock !== null);
  switch (outcome) {
    case 'ok':
      return normaliseEventDto(data!.event);
    case 'mockFallback': {
      const mock = await loadMonitoringEventsMock!();
      return normaliseEventDto(mock.mockCreateCustomEvent(t, label));
    }
    case 'unsupported':
    case 'error':
      throw new Error(`createCustomEvent failed: status ${status}`);
  }
}

/** The service returns a bare 204 on success (no JSON body), so this can't
 *  reuse requestJson's unconditional response.json() - that throws on an
 *  empty body. A 404 here is ambiguous between "route doesn't exist" and
 *  "no such id" (both are valid per the contract); attempting the dev mock
 *  either way is harmless - a real "no such id" 404 against the mock store
 *  just fails there too (the id was never created in it), landing on the
 *  same thrown error. */
export async function deleteCustomEvent(id: number): Promise<void> {
  const { response, status } = await authFetchWithStatus(`/monitoring/events/${id}`, { method: 'DELETE' });
  if (response && response.ok) return;
  if (status === 404 && loadMonitoringEventsMock) {
    const mock = await loadMonitoringEventsMock();
    if (mock.mockDeleteCustomEvent(id)) return;
  }
  throw new Error(`deleteCustomEvent failed: status ${status}`);
}
