// Calendar events API client. Routes live in the local service
// (CalendarRoutes.cs). Dev-tools builds fall back to in-memory fixtures when
// the service has no calendar routes (404), the same idiom as
// api/monitoringEvents.ts.

import { authFetchWithStatus } from './service';
import { classifyFetchOutcome } from './fetchOutcome';

export type CalendarKind = 'ics' | 'google' | 'microsoft';
export type CalendarSyncStatus = 'ok' | 'syncing' | 'error';
export type CalendarSyncError = 'unreachable' | 'unauthorized' | 'notFound' | 'notIcs' | 'tooLarge';
/** Codes a failed add can carry: the sync errors plus a refused address (bad scheme, malformed, private host, source cap) or a feed that is already added. */
export type CalendarAddError = CalendarSyncError | 'invalidUrl' | 'limitReached' | 'duplicate';
export type CalendarRefreshMinutes = 5 | 15 | 30 | 60;

export const CALENDAR_REFRESH_OPTIONS: readonly CalendarRefreshMinutes[] = [5, 15, 30, 60];
export const DEFAULT_REFRESH_MINUTES: CalendarRefreshMinutes = 15;

export interface CalendarSourceDto {
  id: string;
  kind: CalendarKind;
  name: string;
  /** #rrggbb */
  color: string;
  /** Display only. The service never returns the feed URL. */
  host: string | null;
  lastSyncedAt: number | null;
  status: CalendarSyncStatus;
  error: CalendarSyncError | null;
}

export interface CalendarEventDto {
  id: string;
  calendarId: string;
  title: string;
  location: string | null;
  notes: string | null;
  allDay: boolean;
  /** Timed events: UTC epoch ms. */
  start: number;
  end: number;
  /** All-day events: local calendar dates, end exclusive. */
  startDate: string | null;
  endDate: string | null;
  status: 'confirmed' | 'tentative';
  providerId: string | null;
  etag: string | null;
}

export interface CalendarSettingsDto {
  refreshMinutes: CalendarRefreshMinutes;
  lastSyncedAt: number | null;
  syncing: boolean;
}

export interface CalendarEventsResult {
  events: CalendarEventDto[];
  syncedAt: number | null;
  /** The service cut the response at its event cap. */
  truncated?: boolean;
}

export interface AddCalendarInput {
  url: string;
  name: string;
  color: string;
}

/** The service refused an add; `code` is the sync error code when it sent one. */
export class CalendarRequestError extends Error {
  readonly code: CalendarAddError | null;
  constructor(message: string, code: CalendarAddError | null) {
    super(message);
    this.code = code;
  }
}

const ADD_ERRORS: readonly string[] = ['unreachable', 'unauthorized', 'notFound', 'notIcs', 'tooLarge', 'invalidUrl', 'limitReached', 'duplicate'];

type CalendarMockModule = typeof import('./calendarMock');

// Raw build defines, not the DEV_TOOLS const: only this literal guard lets the
// bundler drop the dynamic import, so fixtures stay out of a production bundle.
const loadCalendarMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<CalendarMockModule> => import('./calendarMock')
  : null;

interface RequestOpts { method?: string; body?: unknown }

async function requestJson<T>(path: string, opts?: RequestOpts): Promise<{ data: T | null; status: number }> {
  const { response, status } = await authFetchWithStatus(path, opts);
  if (!response || !response.ok) return { data: null, status };
  if (response.status === 204) return { data: {} as T, status };
  try {
    return { data: (await response.json()) as T, status };
  } catch {
    return { data: null, status };
  }
}

/** Resolves a read: the service answer, the dev mock on a missing route, or a throw. */
async function read<T>(path: string, fromMock: (m: CalendarMockModule) => T): Promise<T> {
  const { data, status } = await requestJson<T>(path);
  switch (classifyFetchOutcome(data, status, loadCalendarMock !== null)) {
    case 'ok':
      return data as T;
    case 'mockFallback':
      return fromMock(await loadCalendarMock!());
    default:
      throw new Error(`calendar request failed: status ${status}`);
  }
}

export async function fetchCalendarSources(): Promise<CalendarSourceDto[]> {
  const res = await read<{ calendars: CalendarSourceDto[] }>(
    '/api/calendar/calendars', m => ({ calendars: m.mockSources() }),
  );
  return res.calendars;
}

export async function fetchCalendarSettings(): Promise<CalendarSettingsDto> {
  return read<CalendarSettingsDto>('/api/calendar/settings', m => m.mockSettings());
}

export async function fetchCalendarEvents(from: number, to: number): Promise<CalendarEventsResult> {
  const query = `from=${Math.round(from)}&to=${Math.round(to)}`;
  return read<CalendarEventsResult>(`/api/calendar/events?${query}`, m => m.mockEvents(from, to));
}

export async function putCalendarRefreshMinutes(refreshMinutes: CalendarRefreshMinutes): Promise<CalendarSettingsDto> {
  const { data, status } = await requestJson<CalendarSettingsDto>('/api/calendar/settings', { method: 'PUT', body: { refreshMinutes } });
  switch (classifyFetchOutcome(data, status, loadCalendarMock !== null)) {
    case 'ok':
      return data as CalendarSettingsDto;
    case 'mockFallback':
      return (await loadCalendarMock!()).mockSetRefreshMinutes(refreshMinutes);
    default:
      throw new Error(`calendar settings failed: status ${status}`);
  }
}

export async function postCalendarRefresh(): Promise<void> {
  const { response, status } = await authFetchWithStatus('/api/calendar/refresh', { method: 'POST' });
  if (response && response.ok) return;
  if (status === 404 && loadCalendarMock) {
    (await loadCalendarMock()).mockRefresh();
    return;
  }
  throw new Error(`calendar refresh failed: status ${status}`);
}

export async function addCalendarSource(input: AddCalendarInput): Promise<CalendarSourceDto> {
  const { response, status } = await authFetchWithStatus('/api/calendar/calendars', { method: 'POST', body: input });
  if (response && response.ok) return (await response.json()) as CalendarSourceDto;
  if (status === 404 && loadCalendarMock) {
    const result = (await loadCalendarMock()).mockAddSource(input);
    if ('error' in result) throw new CalendarRequestError('add failed', result.error);
    return result.source;
  }
  throw new CalendarRequestError(`add calendar failed: status ${status}`, await errorCodeOf(response));
}

export interface CalendarProbe {
  name: string | null;
  host: string;
}

async function errorCodeOf(response: Response | null): Promise<CalendarAddError | null> {
  try {
    const body = (await response?.json()) as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && ADD_ERRORS.includes(body.error)) return body.error as CalendarAddError;
  } catch {
    // Body absent or not JSON.
  }
  return null;
}

/** Fetches the feed once to read its own name. Null when the service has no probe route (nothing to fill in); a refused address throws a CalendarRequestError. */
export async function probeCalendar(url: string): Promise<CalendarProbe | null> {
  const { response, status } = await authFetchWithStatus('/api/calendar/probe', { method: 'POST', body: { url } });
  if (response && response.ok) return (await response.json()) as CalendarProbe;
  if (status === 404) {
    if (!loadCalendarMock) return null;
    const result = (await loadCalendarMock()).mockProbe(url);
    if ('error' in result) throw new CalendarRequestError('probe failed', result.error);
    return result.probe;
  }
  if (status === 400) throw new CalendarRequestError('probe refused', await errorCodeOf(response));
  return null;
}

export async function updateCalendarSource(id: string, patch: { name?: string; color?: string }): Promise<CalendarSourceDto> {
  const { data, status } = await requestJson<CalendarSourceDto>(`/api/calendar/calendars/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  switch (classifyFetchOutcome(data, status, loadCalendarMock !== null)) {
    case 'ok':
      return data as CalendarSourceDto;
    case 'mockFallback': {
      const updated = (await loadCalendarMock!()).mockUpdateSource(id, patch);
      if (updated) return updated;
      throw new Error('update calendar failed: unknown calendar');
    }
    default:
      throw new Error(`update calendar failed: status ${status}`);
  }
}

export async function removeCalendarSource(id: string): Promise<void> {
  const { response, status } = await authFetchWithStatus(`/api/calendar/calendars/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response && response.ok) return;
  if (status === 404 && loadCalendarMock) {
    (await loadCalendarMock()).mockRemoveSource(id);
    return;
  }
  throw new Error(`remove calendar failed: status ${status}`);
}

/** Subscribes to the dev mock's change signal, standing in for the `calendar` topic frame. A no-op in distribution builds. */
export function subscribeCalendarMock(listener: () => void): () => void {
  if (!loadCalendarMock) return () => {};
  let off: (() => void) | null = null;
  let cancelled = false;
  void loadCalendarMock().then(m => { if (!cancelled) off = m.onMockCalendarChange(listener); });
  return () => { cancelled = true; off?.(); };
}
