// Dev-tools reminders fixtures: an in-memory stand-in for the service routes,
// loaded only behind the raw build guard in api/reminders.ts.

import type {
  NewReminderInput, NewReminderListInput, ReminderDto, ReminderListDto, ReminderListPatch, ReminderPatch, RemindersSnapshot,
} from './reminders';
import { REMINDER_LIMITS, ReminderRequestError } from './reminders';
import { buildPreviewReminders, PREVIEW_LISTS } from '../panel/widgets/reminders/reminderPreviewData';

const seed = buildPreviewReminders(Date.now());
let lists: ReminderListDto[] = PREVIEW_LISTS.map(l => ({ ...l }));
let items: ReminderDto[] = seed.map(i => ({ ...i }));
let nextId = 1;
const listeners = new Set<() => void>();

const COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

let unavailable = false;

/** Dev switch: every route answers 503 `unavailable`, as when the service cannot read its store. */
export function mockSetUnavailable(on: boolean): void {
  unavailable = on;
  changed();
}

function ensureAvailable(): void {
  if (unavailable) throw new ReminderRequestError('unavailable', 'unavailable');
}

const invalid = () => new ReminderRequestError('invalid', 'invalid');
const notFound = () => new ReminderRequestError('notFound', 'notFound');

function validUrl(url: string): boolean {
  if (url.length > REMINDER_LIMITS.url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Mirrors the service's field rules; a null clears where the service allows it. */
function checkItemFields(f: Partial<ReminderPatch> & { title?: string }): void {
  if (f.title !== undefined && (f.title.trim() === '' || f.title.trim().length > REMINDER_LIMITS.title)) throw invalid();
  if (f.notes != null && f.notes.length > REMINDER_LIMITS.notes) throw invalid();
  if (f.dueDate != null && !DATE.test(f.dueDate)) throw invalid();
  if (f.dueTime != null && !TIME.test(f.dueTime)) throw invalid();
  if (f.url != null && !validUrl(f.url)) throw invalid();
  if (f.priority !== undefined && ![0, 1, 2, 3].includes(f.priority)) throw invalid();
  if (f.order !== undefined && !(Number.isInteger(f.order) && f.order >= 0 && f.order <= REMINDER_LIMITS.maxOrder)) throw invalid();
}

function checkListFields(f: ReminderListPatch): void {
  if (f.order !== undefined && !(Number.isInteger(f.order) && f.order >= 0 && f.order <= REMINDER_LIMITS.maxOrder)) throw invalid();
  if (f.name !== undefined && (f.name.trim() === '' || f.name.trim().length > REMINDER_LIMITS.listName)) throw invalid();
  if (f.color !== undefined && !COLOR.test(f.color)) throw invalid();
  if (f.icon !== undefined && !ICON.test(f.icon)) throw invalid();
}

/** The mock has no socket: the store subscribes here for the same refetch signal a topic frame gives. */
export function onMockRemindersChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const changed = () => listeners.forEach(l => l());

export function mockSnapshot(): RemindersSnapshot {
  ensureAvailable();
  return { lists: lists.map(l => ({ ...l })), items: items.map(i => ({ ...i })) };
}

export function mockCreateList(input: NewReminderListInput): ReminderListDto {
  ensureAvailable();
  checkListFields(input);
  if (lists.length >= REMINDER_LIMITS.lists) throw new ReminderRequestError('limitReached', 'limitReached');
  const name = input.name.trim();
  const list: ReminderListDto = {
    id: `mock-list-${nextId++}`, name, color: input.color, icon: input.icon,
    order: lists.reduce((m, l) => Math.max(m, l.order), -1) + 1, createdAt: Date.now(),
  };
  lists = [...lists, list];
  changed();
  return { ...list };
}

export function mockUpdateList(id: string, patch: ReminderListPatch): ReminderListDto {
  ensureAvailable();
  const current = lists.find(l => l.id === id);
  if (!current) throw notFound();
  checkListFields(patch);
  const next = { ...current, ...patch, name: patch.name === undefined ? current.name : patch.name.trim() };
  lists = lists.map(l => (l.id === id ? next : l));
  changed();
  return { ...next };
}

export function mockDeleteList(id: string): Record<string, never> {
  ensureAvailable();
  if (!lists.some(l => l.id === id)) throw notFound();
  if (lists.length === 1) throw new ReminderRequestError('lastList', 'lastList');
  lists = lists.filter(l => l.id !== id);
  items = items.filter(i => i.listId !== id);
  changed();
  return {};
}

export function mockCreateItem(input: NewReminderInput): ReminderDto {
  ensureAvailable();
  checkItemFields(input);
  if (input.dueTime != null && input.dueDate == null) throw invalid();
  if (!lists.some(l => l.id === input.listId)) throw notFound();
  if (items.length >= REMINDER_LIMITS.items) throw new ReminderRequestError('limitReached', 'limitReached');
  const title = input.title.trim();
  const now = Date.now();
  const item: ReminderDto = {
    id: `mock-item-${nextId++}`, listId: input.listId, title, notes: input.notes ?? null,
    dueDate: input.dueDate ?? null, dueTime: input.dueTime ?? null,
    priority: input.priority ?? 0, flagged: input.flagged ?? false, completed: false, completedAt: null,
    url: input.url ?? null,
    order: items.filter(i => i.listId === input.listId).reduce((m, i) => Math.max(m, i.order), -1) + 1,
    createdAt: now, updatedAt: now,
  };
  items = [...items, item];
  changed();
  return { ...item };
}

export function mockUpdateItem(id: string, patch: ReminderPatch): ReminderDto {
  ensureAvailable();
  const current = items.find(i => i.id === id);
  if (!current) throw notFound();
  checkItemFields(patch);
  if (patch.listId !== undefined && !lists.some(l => l.id === patch.listId)) throw notFound();
  const now = Date.now();
  const next: ReminderDto = { ...current, ...patch, updatedAt: now } as ReminderDto;
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.dueDate === null) next.dueTime = null;
  else if (patch.dueTime != null && next.dueDate === null) throw invalid();
  if (patch.completed !== undefined) next.completedAt = patch.completed ? now : null;
  if (patch.listId !== undefined && patch.listId !== current.listId && patch.order === undefined) {
    next.order = items.filter(i => i.listId === patch.listId).reduce((m, i) => Math.max(m, i.order), -1) + 1;
  }
  items = items.map(i => (i.id === id ? next : i));
  changed();
  return { ...next };
}

export function mockDeleteItem(id: string): Record<string, never> {
  ensureAvailable();
  if (!items.some(i => i.id === id)) throw notFound();
  items = items.filter(i => i.id !== id);
  changed();
  return {};
}

export function mockClearCompleted(listId?: string): { removed: number } {
  ensureAvailable();
  const keep = items.filter(i => !(i.completed && (listId === undefined || i.listId === listId)));
  const removed = items.length - keep.length;
  items = keep;
  changed();
  return { removed };
}

export function mockReorder(listId: string, itemIds: string[]): Record<string, never> {
  ensureAvailable();
  if (!lists.some(l => l.id === listId)) throw notFound();
  const current = items.filter(i => i.listId === listId).map(i => i.id);
  const exact = itemIds.length === current.length && new Set(itemIds).size === itemIds.length && itemIds.every(id => current.includes(id));
  if (!exact) throw new ReminderRequestError('stale', 'stale');
  const rank = new Map(itemIds.map((id, index) => [id, index]));
  items = items.map(i => (i.listId === listId && rank.has(i.id) ? { ...i, order: rank.get(i.id)! } : i));
  changed();
  return {};
}
