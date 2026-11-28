import { describe, expect, it } from 'vitest';
import type { ReminderDto, ReminderListDto } from '../../../api/reminders';
import {
  addIsoDays, applyItemPatch, applyReorder, buildView, dueLabel, isOverdue, isoDate, newItemDefaults, nextListColor, parseSelection,
  priorityMarks, resolveSelection, smartCounts, type ReminderSelection,
} from './reminderLogic';

const NOW = new Date(2026, 10, 17, 14, 35).getTime();
const TODAY = '2026-11-17';

const lists: ReminderListDto[] = [
  { id: 'b', name: 'Beta', color: '#111111', icon: 'list', order: 1, createdAt: 2 },
  { id: 'a', name: 'Alpha', color: '#222222', icon: 'list', order: 0, createdAt: 1 },
];

let n = 0;
function item(listId: string, title: string, extra: Partial<ReminderDto> = {}): ReminderDto {
  n += 1;
  return {
    id: `i${n}`, listId, title, notes: null, dueDate: null, dueTime: null, priority: 0, flagged: false, completed: false,
    completedAt: null, url: null, order: n, createdAt: n, updatedAt: n, ...extra,
  };
}

const items: ReminderDto[] = [
  item('a', 'overdue day', { dueDate: '2026-11-15' }),
  item('a', 'overdue time', { dueDate: TODAY, dueTime: '09:00' }),
  item('a', 'later today', { dueDate: TODAY, dueTime: '18:00' }),
  item('b', 'today all day', { dueDate: TODAY }),
  item('b', 'tomorrow', { dueDate: '2026-11-18', flagged: true }),
  item('b', 'undated'),
  item('a', 'done a', { completed: true, completedAt: 100 }),
  item('b', 'done b', { completed: true, completedAt: 200, dueDate: TODAY }),
];

const smart = (id: 'today' | 'scheduled' | 'overdue' | 'flagged' | 'all' | 'completed'): ReminderSelection => ({ kind: 'smart', id });
const titles = (v: ReturnType<typeof buildView>) => v.groups.map(g => g.items.map(i => i.title));

describe('reminder smart lists', () => {
  it('counts each smart list from open items', () => {
    expect(smartCounts(items, NOW)).toEqual({ today: 4, scheduled: 5, overdue: 2, flagged: 1, all: 6, completed: 2 });
  });

  it('puts overdue first in Today, then the rest by due time with all-day first', () => {
    const view = buildView(items, lists, smart('today'), { now: NOW, showCompleted: false });
    expect(view.groups.map(g => g.kind)).toEqual(['overdue', 'plain']);
    expect(titles(view)).toEqual([['overdue day', 'overdue time'], ['today all day', 'later today']]);
    expect(view.openCount).toBe(4);
  });

  it('groups Scheduled by date in date order', () => {
    const view = buildView(items, lists, smart('scheduled'), { now: NOW, showCompleted: false });
    expect(view.groups.map(g => g.date)).toEqual(['2026-11-15', TODAY, '2026-11-18']);
    expect(view.groups[1].items.map(i => i.title)).toEqual(['today all day', 'overdue time', 'later today']);
  });

  it('lists Overdue as open items past due, oldest first, and keeps them in Today too', () => {
    const view = buildView(items, lists, smart('overdue'), { now: NOW, showCompleted: false });
    expect(titles(view)).toEqual([['overdue day', 'overdue time']]);
    expect(view.openCount).toBe(2);
    const today = buildView(items, lists, smart('today'), { now: NOW, showCompleted: false });
    expect(today.groups[0].items.map(i => i.title)).toEqual(['overdue day', 'overdue time']);
  });

  it('groups All by list in list order and skips empty lists', () => {
    const view = buildView(items, lists, smart('all'), { now: NOW, showCompleted: false });
    expect(view.groups.map(g => g.listId)).toEqual(['a', 'b']);
  });

  it('lists Flagged flat and Completed newest first', () => {
    expect(titles(buildView(items, lists, smart('flagged'), { now: NOW, showCompleted: false }))).toEqual([['tomorrow']]);
    expect(titles(buildView(items, lists, smart('completed'), { now: NOW, showCompleted: false }))).toEqual([['done b', 'done a']]);
  });

  it('shows a user list by manual order and its completed items only when asked', () => {
    const sel: ReminderSelection = { kind: 'list', id: 'b' };
    const hidden = buildView(items, lists, sel, { now: NOW, showCompleted: false });
    expect(titles(hidden)).toEqual([['today all day', 'tomorrow', 'undated']]);
    expect(hidden.completed).toEqual([]);
    expect(buildView(items, lists, sel, { now: NOW, showCompleted: true }).completed.map(i => i.title)).toEqual(['done b']);
  });
});

describe('overdue at the day boundary', () => {
  const at = (y: number, m: number, d: number, h: number, min: number, s = 0, ms = 0) => new Date(y, m, d, h, min, s, ms).getTime();
  const dateOnly = item('a', 'date only', { dueDate: TODAY });
  const timed = (time: string) => item('a', 'timed', { dueDate: TODAY, dueTime: time });
  const yesterdayLate = item('a', 'yesterday late', { dueDate: '2026-11-16', dueTime: '23:59' });

  it('does not count a date-only item until its day has passed', () => {
    expect(isOverdue(dateOnly, at(2026, 10, 17, 0, 0))).toBe(false);
    expect(isOverdue(dateOnly, at(2026, 10, 17, 23, 59, 59, 999))).toBe(false);
    expect(isOverdue(dateOnly, at(2026, 10, 18, 0, 0))).toBe(true);
  });

  it('counts a timed item only once its minute is past, strictly', () => {
    expect(isOverdue(timed('00:00'), at(2026, 10, 17, 0, 0))).toBe(false);
    expect(isOverdue(timed('00:00'), at(2026, 10, 17, 0, 0, 0, 1))).toBe(true);
    expect(isOverdue(timed('23:59'), at(2026, 10, 17, 23, 59, 59, 999))).toBe(true);
    expect(isOverdue(yesterdayLate, at(2026, 10, 17, 0, 0))).toBe(true);
  });

  it('fills the Overdue count and list from those rules across midnight', () => {
    const rows = [dateOnly, timed('00:00'), yesterdayLate];
    const justAfterMidnight = at(2026, 10, 17, 0, 0);
    expect(smartCounts(rows, justAfterMidnight).overdue).toBe(1);
    const nextDay = at(2026, 10, 18, 0, 0);
    expect(smartCounts(rows, nextDay).overdue).toBe(3);
    expect(buildView(rows, lists, smart('overdue'), { now: nextDay, showCompleted: false }).openCount).toBe(3);
  });

  it('has no add row in Overdue', () => {
    expect(newItemDefaults(smart('overdue'), lists, NOW)).toBeNull();
  });
});

describe('reminder due dates', () => {
  it('flags a timed item overdue only once its time passes', () => {
    expect(isOverdue(items[1], NOW)).toBe(true);
    expect(isOverdue(items[2], NOW)).toBe(false);
    expect(isOverdue(items[3], NOW)).toBe(false);
    expect(isOverdue(items[0], NOW)).toBe(true);
    expect(isOverdue(items[6], NOW)).toBe(false);
  });

  it('words the due line with relative days and the time', () => {
    const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}|${Object.values(params).join('|')}` : key);
    const fmt = { monthDayShort: () => 'Nov 20', time: () => '6:00 PM' };
    expect(dueLabel(items[3], NOW, t, fmt)).toEqual({ text: 'reminders.due.today', overdue: false });
    expect(dueLabel(items[2], NOW, t, fmt)).toEqual({ text: 'reminders.due.dateTime|reminders.due.today|6:00 PM', overdue: false });
    expect(dueLabel(item('a', 'x', { dueDate: '2026-11-18' }), NOW, t, fmt)?.text).toBe('reminders.due.tomorrow');
    expect(dueLabel(item('a', 'x', { dueDate: '2026-11-16' }), NOW, t, fmt)).toEqual({ text: 'reminders.due.yesterday', overdue: true });
    expect(dueLabel(item('a', 'x', { dueDate: '2026-11-20' }), NOW, t, fmt)?.text).toBe('Nov 20');
    expect(dueLabel(items[5], NOW, t, fmt)).toBeNull();
  });

  it('does date math on local days', () => {
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoDate(NOW)).toBe(TODAY);
    expect(priorityMarks(3)).toBe('!!!');
    expect(priorityMarks(0)).toBe('');
  });
});

describe('reminder selection and edits', () => {
  it('parses stored keys and falls back to Today', () => {
    expect(parseSelection('smart:flagged', lists)).toEqual(smart('flagged'));
    expect(parseSelection('a', lists)).toEqual({ kind: 'list', id: 'a' });
    expect(parseSelection('gone', lists)).toBeNull();
    expect(parseSelection('smart:nope', lists)).toBeNull();
    expect(resolveSelection(undefined, lists)).toEqual(smart('today'));
  });

  it('derives new item defaults from the view', () => {
    expect(newItemDefaults(smart('today'), lists, NOW)).toEqual({ listId: 'a', dueDate: TODAY });
    expect(newItemDefaults(smart('scheduled'), lists, NOW)).toEqual({ listId: 'a', dueDate: TODAY });
    expect(newItemDefaults(smart('flagged'), lists, NOW)).toEqual({ listId: 'a', flagged: true });
    expect(newItemDefaults(smart('completed'), lists, NOW)).toBeNull();
    expect(newItemDefaults({ kind: 'list', id: 'b' }, lists, NOW)).toEqual({ listId: 'b' });
    expect(newItemDefaults(smart('all'), [], NOW)).toBeNull();
  });

  it('applies a patch like the service: completedAt follows completed, dueTime follows dueDate', () => {
    const base = item('a', 'p', { dueDate: TODAY, dueTime: '10:00' });
    expect(applyItemPatch(base, { completed: true }, 500).completedAt).toBe(500);
    expect(applyItemPatch({ ...base, completed: true, completedAt: 5 }, { completed: false }, 500).completedAt).toBeNull();
    expect(applyItemPatch(base, { dueDate: null }, 500).dueTime).toBeNull();
  });

  it('reorders only the named list and picks the first unused color', () => {
    const rows = [item('a', '1'), item('a', '2'), item('b', '3')];
    const next = applyReorder(rows, 'a', [rows[1].id, rows[0].id]);
    expect(next.map(r => r.order)).toEqual([1, 0, rows[2].order]);
    expect(nextListColor(['#AAA111'], ['#aaa111', '#bbb222'])).toBe('#bbb222');
    expect(nextListColor(['#aaa111', '#bbb222'], ['#aaa111', '#bbb222'])).toBe('#aaa111');
  });
});
