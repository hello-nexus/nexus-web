import type { ReminderDto, ReminderListDto, ReminderPatch, ReminderPriority } from '../../../api/reminders';
import type { CalendarFormat } from '../calendar/useCalendarFormat';

export type SmartListId = 'today' | 'scheduled' | 'all' | 'flagged' | 'completed';
export const SMART_LISTS: readonly SmartListId[] = ['today', 'scheduled', 'all', 'flagged', 'completed'];

export type ReminderSelection = { kind: 'smart'; id: SmartListId } | { kind: 'list'; id: string };

export type ReminderCounts = Record<SmartListId, number>;

export type ReminderGroupKind = 'plain' | 'overdue' | 'date' | 'list';

export interface ReminderGroup {
  key: string;
  kind: ReminderGroupKind;
  date?: string;
  listId?: string;
  items: ReminderDto[];
}

export interface ReminderView {
  groups: ReminderGroup[];
  /** Completed items under the open ones, a user list with Show Completed on. */
  completed: ReminderDto[];
  /** Items the groups hold. */
  openCount: number;
}

export const DEFAULT_SELECTION_KEY = 'smart:today';
const SMART_PREFIX = 'smart:';

export const selectionKey = (s: ReminderSelection): string => (s.kind === 'smart' ? `${SMART_PREFIX}${s.id}` : s.id);

/** Reads a stored key; a smart id or a list that still exists, else null. */
export function parseSelection(key: string | null | undefined, lists: readonly ReminderListDto[]): ReminderSelection | null {
  if (!key) return null;
  if (key.startsWith(SMART_PREFIX)) {
    const id = key.slice(SMART_PREFIX.length);
    return (SMART_LISTS as readonly string[]).includes(id) ? { kind: 'smart', id: id as SmartListId } : null;
  }
  return lists.some(l => l.id === key) ? { kind: 'list', id: key } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days).getTime());
}

/** Local epoch ms of a due date; a date with no time is its start of day. */
export function dueMs(dueDate: string, dueTime: string | null): number {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [h, min] = dueTime ? dueTime.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, h, min).getTime();
}

export function isOverdue(item: ReminderDto, now: number): boolean {
  if (item.completed || !item.dueDate) return false;
  const today = isoDate(now);
  if (item.dueDate < today) return true;
  return item.dueDate === today && item.dueTime !== null && dueMs(item.dueDate, item.dueTime) < now;
}

const byOrder = (a: ReminderDto, b: ReminderDto) => a.order - b.order || a.createdAt - b.createdAt;
const byDue = (a: ReminderDto, b: ReminderDto) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  || (a.dueTime ?? '').localeCompare(b.dueTime ?? '')
  || byOrder(a, b);
const byCompletedDesc = (a: ReminderDto, b: ReminderDto) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

export function smartCounts(items: readonly ReminderDto[], now: number): ReminderCounts {
  const today = isoDate(now);
  const counts: ReminderCounts = { today: 0, scheduled: 0, all: 0, flagged: 0, completed: 0 };
  for (const item of items) {
    if (item.completed) { counts.completed++; continue; }
    counts.all++;
    if (item.flagged) counts.flagged++;
    if (item.dueDate) {
      counts.scheduled++;
      if (item.dueDate <= today) counts.today++;
    }
  }
  return counts;
}

export function openCountOf(items: readonly ReminderDto[], listId: string): number {
  return items.reduce((n, i) => n + (i.listId === listId && !i.completed ? 1 : 0), 0);
}

export function sortLists(lists: readonly ReminderListDto[]): ReminderListDto[] {
  return [...lists].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

function groupByDate(items: ReminderDto[]): ReminderGroup[] {
  const out: ReminderGroup[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.date === item.dueDate) last.items.push(item);
    else out.push({ key: `date:${item.dueDate}`, kind: 'date', date: item.dueDate ?? undefined, items: [item] });
  }
  return out;
}

/** The rows a selection shows: Today puts overdue first, Scheduled groups by date, All by list. */
export function buildView(
  items: readonly ReminderDto[], lists: readonly ReminderListDto[], selection: ReminderSelection,
  opts: { now: number; showCompleted: boolean },
): ReminderView {
  const today = isoDate(opts.now);
  const open = items.filter(i => !i.completed);
  const done = items.filter(i => i.completed).sort(byCompletedDesc);
  const plain = (list: ReminderDto[]): ReminderGroup[] => (list.length > 0 ? [{ key: 'plain', kind: 'plain', items: list }] : []);

  if (selection.kind === 'list') {
    const mine = open.filter(i => i.listId === selection.id).sort(byOrder);
    return {
      groups: plain(mine),
      completed: opts.showCompleted ? done.filter(i => i.listId === selection.id) : [],
      openCount: mine.length,
    };
  }
  switch (selection.id) {
    case 'today': {
      const due = open.filter(i => i.dueDate !== null && i.dueDate <= today).sort(byDue);
      const overdue = due.filter(i => isOverdue(i, opts.now));
      const rest = due.filter(i => !isOverdue(i, opts.now));
      const groups: ReminderGroup[] = [];
      if (overdue.length > 0) groups.push({ key: 'overdue', kind: 'overdue', items: overdue });
      groups.push(...plain(rest));
      return { groups, completed: [], openCount: due.length };
    }
    case 'scheduled': {
      const due = open.filter(i => i.dueDate !== null).sort(byDue);
      return { groups: groupByDate(due), completed: [], openCount: due.length };
    }
    case 'flagged': {
      const flagged = open.filter(i => i.flagged).sort(byDue);
      return { groups: plain(flagged), completed: [], openCount: flagged.length };
    }
    case 'completed':
      return { groups: plain(done), completed: [], openCount: done.length };
    default: {
      const groups: ReminderGroup[] = [];
      for (const list of sortLists(lists)) {
        const mine = open.filter(i => i.listId === list.id).sort(byOrder);
        if (mine.length > 0) groups.push({ key: `list:${list.id}`, kind: 'list', listId: list.id, items: mine });
      }
      return { groups, completed: [], openCount: open.length };
    }
  }
}

export interface DueLabel { text: string; overdue: boolean }

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The due line under a title: Today / Tomorrow / Yesterday or a short date, then the time when set. */
export function dueLabel(
  item: ReminderDto, now: number, t: Translate, fmt: Pick<CalendarFormat, 'monthDayShort' | 'time'>,
): DueLabel | null {
  if (!item.dueDate) return null;
  const today = isoDate(now);
  const day = dueMs(item.dueDate, null);
  const date = item.dueDate === today ? t('reminders.due.today')
    : item.dueDate === addIsoDays(today, 1) ? t('reminders.due.tomorrow')
    : item.dueDate === addIsoDays(today, -1) ? t('reminders.due.yesterday')
    : fmt.monthDayShort(day);
  const text = item.dueTime ? t('reminders.due.dateTime', { date, time: fmt.time(dueMs(item.dueDate, item.dueTime)) }) : date;
  return { text, overdue: isOverdue(item, now) };
}

export const priorityMarks = (p: ReminderPriority): string => '!'.repeat(p);

/** The fields a new reminder takes from the view it is added in. */
export function newItemDefaults(
  selection: ReminderSelection, lists: readonly ReminderListDto[], now: number,
): { listId: string; dueDate?: string; flagged?: boolean } | null {
  const first = sortLists(lists)[0];
  if (selection.kind === 'list') return { listId: selection.id };
  if (!first) return null;
  if (selection.id === 'today') return { listId: first.id, dueDate: isoDate(now) };
  if (selection.id === 'flagged') return { listId: first.id, flagged: true };
  if (selection.id === 'completed') return null;
  return { listId: first.id };
}

/** Applies a patch the way the service will, for the optimistic copy. */
export function applyItemPatch(item: ReminderDto, patch: ReminderPatch, now: number): ReminderDto {
  const next = { ...item, ...patch, updatedAt: now } as ReminderDto;
  if (patch.completed !== undefined) next.completedAt = patch.completed ? now : null;
  if (next.dueDate === null) next.dueTime = null;
  return next;
}

export function applyReorder(items: readonly ReminderDto[], listId: string, ids: readonly string[]): ReminderDto[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return items.map(i => (i.listId === listId && rank.has(i.id) ? { ...i, order: rank.get(i.id)! } : i));
}

export function nextListColor(used: readonly string[], palette: readonly string[]): string {
  const taken = new Set(used.map(c => c.toLowerCase()));
  return palette.find(c => !taken.has(c)) ?? palette[0];
}

/** The ids a drag may reorder: a user list's open items in their shown order. */
export const reorderableIds = (view: ReminderView): string[] => view.groups.flatMap(g => g.items.map(i => i.id));

/** The list a selection edits against: a user list, else null. */
export const selectedListId = (s: ReminderSelection): string | null => (s.kind === 'list' ? s.id : null);

/** Whether a smart or user selection with this view is empty of anything to show. */
export const isViewEmpty = (view: ReminderView): boolean => view.groups.length === 0 && view.completed.length === 0;

/** Resolves a stored widget key to a selection, falling back to Today. */
export function resolveSelection(key: unknown, lists: readonly ReminderListDto[]): ReminderSelection {
  return parseSelection(typeof key === 'string' ? key : null, lists) ?? { kind: 'smart', id: 'today' };
}
