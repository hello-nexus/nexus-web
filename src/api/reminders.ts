// Reminders API client. Routes live in the local service. Dev-tools builds
// fall back to in-memory fixtures when the service has no reminders routes
// (404 without a code), the same idiom as api/calendar.ts.

import { authFetchWithStatus } from './service';

export type ReminderPriority = 0 | 1 | 2 | 3;
export type ReminderErrorCode = 'invalid' | 'limitReached' | 'notFound' | 'lastList' | 'saveFailed' | 'stale' | 'unavailable';

export interface ReminderListDto {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
  icon: string;
  order: number;
  createdAt: number;
}

export interface ReminderDto {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  /** Local calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  /** HH:mm, only with a dueDate. */
  dueTime: string | null;
  priority: ReminderPriority;
  flagged: boolean;
  completed: boolean;
  completedAt: number | null;
  url: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface RemindersSnapshot {
  lists: ReminderListDto[];
  items: ReminderDto[];
}

export interface NewReminderListInput { name: string; color: string; icon: string }
export type ReminderListPatch = Partial<NewReminderListInput> & { order?: number };

export interface NewReminderInput {
  listId: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: ReminderPriority;
  flagged?: boolean;
  url?: string | null;
}

/** A partial update: null clears a nullable field, `completed` toggles. */
export type ReminderPatch = Partial<Omit<NewReminderInput, 'listId'>> & { listId?: string; completed?: boolean; order?: number };

/** The service's field limits, mirrored for input maxLength and the dev mock. */
export const REMINDER_LIMITS = {
  lists: 100,
  items: 5000,
  title: 500,
  notes: 10000,
  listName: 100,
  url: 2048,
  emojiGlyph: 32,
  maxOrder: 1_000_000,
} as const;

/** The service refused a request; `code` is its machine code when it sent one. */
export class ReminderRequestError extends Error {
  readonly code: ReminderErrorCode | null;
  constructor(message: string, code: ReminderErrorCode | null) {
    super(message);
    this.code = code;
  }
}

const CODES: readonly string[] = ['invalid', 'limitReached', 'notFound', 'lastList', 'saveFailed', 'stale', 'unavailable'];

type RemindersMockModule = typeof import('./remindersMock');

// Raw build defines, not the DEV_TOOLS const: only this literal guard lets the
// bundler drop the dynamic import, so fixtures stay out of a production bundle.
const loadMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<RemindersMockModule> => import('./remindersMock')
  : null;

interface Outcome<T> { data: T | null; status: number; code: ReminderErrorCode | null }

async function send<T>(path: string, method: string, body?: unknown): Promise<Outcome<T>> {
  const { response, status } = await authFetchWithStatus(path, { method, body });
  let json: unknown = null;
  if (response) {
    try { json = await response.json(); } catch { /* empty or non-JSON body */ }
  }
  const rawCode = (json as { code?: unknown } | null)?.code;
  const code = typeof rawCode === 'string' && CODES.includes(rawCode) ? (rawCode as ReminderErrorCode) : null;
  if (!response || !response.ok) return { data: null, status, code };
  return { data: (json ?? {}) as T, status, code: null };
}

/** A 404 that carries no code is a service without the routes; `notFound` is a real answer about an id. */
const routeMissing = (o: Outcome<unknown>) => o.status === 404 && o.code === null;

async function call<T>(path: string, method: string, body: unknown, fromMock: ((m: RemindersMockModule) => T) | null): Promise<T> {
  const out = await send<T>(path, method, body);
  if (out.data !== null) return out.data;
  if (routeMissing(out) && loadMock && fromMock) return fromMock(await loadMock());
  throw new ReminderRequestError(`reminders request failed: status ${out.status}`, out.code);
}

const enc = encodeURIComponent;

export function fetchReminders(): Promise<RemindersSnapshot> {
  return call<RemindersSnapshot>('/api/reminders', 'GET', undefined, m => m.mockSnapshot());
}

export function createReminderList(input: NewReminderListInput): Promise<ReminderListDto> {
  return call('/api/reminders/lists', 'POST', input, m => m.mockCreateList(input));
}

export function updateReminderList(id: string, patch: ReminderListPatch): Promise<ReminderListDto> {
  return call(`/api/reminders/lists/${enc(id)}`, 'PUT', patch, m => m.mockUpdateList(id, patch));
}

export async function deleteReminderList(id: string): Promise<void> {
  await call<unknown>(`/api/reminders/lists/${enc(id)}`, 'DELETE', undefined, m => m.mockDeleteList(id));
}

export function createReminder(input: NewReminderInput): Promise<ReminderDto> {
  return call('/api/reminders/items', 'POST', input, m => m.mockCreateItem(input));
}

export function updateReminder(id: string, patch: ReminderPatch): Promise<ReminderDto> {
  return call(`/api/reminders/items/${enc(id)}`, 'PUT', patch, m => m.mockUpdateItem(id, patch));
}

export async function deleteReminder(id: string): Promise<void> {
  await call<unknown>(`/api/reminders/items/${enc(id)}`, 'DELETE', undefined, m => m.mockDeleteItem(id));
}

export function clearCompletedReminders(): Promise<{ removed: number }> {
  return call('/api/reminders/items/clear-completed', 'POST', {}, m => m.mockClearCompleted());
}

/** `itemIds` is the list's full current item set; the service answers `stale` when it differs. */
export async function reorderReminders(listId: string, itemIds: string[]): Promise<void> {
  await call<unknown>('/api/reminders/reorder', 'POST', { listId, itemIds }, m => m.mockReorder(listId, itemIds));
}

/** Subscribes to the dev mock's change signal, standing in for the `reminders` topic frame. A no-op in distribution builds. */
export function subscribeRemindersMock(listener: () => void): () => void {
  if (!loadMock) return () => {};
  let off: (() => void) | null = null;
  let cancelled = false;
  void loadMock().then(m => { if (!cancelled) off = m.onMockRemindersChange(listener); });
  return () => { cancelled = true; off?.(); };
}
