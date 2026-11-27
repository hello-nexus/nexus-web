// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CalendarEventDto } from '../../../api/calendar';
import {
  addDays, buildUpNext, describeAgo, describeWhen, dotCalendarsOnDay, eventsOnDay, groupAgenda, layoutAllDayLanes,
  layoutDaySegments, monthWeeks, normalizeEvent, planMonthWeek, resolveCalendarDisplay, resolveImmersiveView,
  selectNextEvents, startOfDay, startOfMonth, startOfWeek, syncedText, type CalEvent,
} from './calendarEvents';

const at = (day: number, h = 0, m = 0) => new Date(2026, 10, day, h, m).getTime();
const NOW = at(17, 14, 35);
const TODAY = startOfDay(NOW);

let seq = 0;
function timed(day: number, sh: number, sm: number, eh: number, em: number, title = 'T', cal = 'a'): CalEvent {
  return { id: `e${seq++}`, calendarId: cal, title, location: null, notes: null, allDay: false, start: at(day, sh, sm), end: at(day, eh, em), tentative: false };
}
function allDay(first: number, last: number, title = 'A', cal = 'a'): CalEvent {
  return { id: `e${seq++}`, calendarId: cal, title, location: null, notes: null, allDay: true, start: at(first), end: at(last + 1), tentative: false };
}

describe('normalizeEvent', () => {
  const base: CalendarEventDto = {
    id: 'x', calendarId: 'c', title: 't', location: null, notes: null, allDay: false, start: 1000, end: 2000,
    startDate: null, endDate: null, status: 'confirmed', providerId: null, etag: null,
  };

  it('keeps timed instants as given and clamps an inverted end', () => {
    expect(normalizeEvent(base)).toMatchObject({ start: 1000, end: 2000, tentative: false });
    expect(normalizeEvent({ ...base, start: 2000, end: 1000 }).end).toBe(2000);
  });

  it('turns all-day dates into local midnights, end exclusive', () => {
    const ev = normalizeEvent({ ...base, allDay: true, startDate: '2026-11-18', endDate: '2026-11-21' });
    expect(ev.start).toBe(at(18));
    expect(ev.end).toBe(at(21));
  });

  it('gives an all-day event with no usable end one day', () => {
    const ev = normalizeEvent({ ...base, allDay: true, startDate: '2026-11-18', endDate: null });
    expect(ev.end).toBe(at(19));
  });

  it('renders an all-day event from its dates, ignoring start and end instants outside the day', () => {
    const ev = normalizeEvent({ ...base, allDay: true, start: at(18) - 14 * 3_600_000, end: at(19) - 14 * 3_600_000, startDate: '2026-11-18', endDate: '2026-11-19' });
    expect(eventsOnDay([ev], at(18)).allDay).toHaveLength(1);
    expect(eventsOnDay([ev], at(17)).allDay).toHaveLength(0);
  });

  it('marks tentative events', () => {
    expect(normalizeEvent({ ...base, status: 'tentative' }).tentative).toBe(true);
  });
});

describe('eventsOnDay', () => {
  it('lists all-day first including multi-day spans, then timed by start', () => {
    const late = timed(17, 20, 0, 21, 0, 'late');
    const early = timed(17, 9, 0, 10, 0, 'early');
    const span = allDay(16, 18, 'span');
    const other = timed(18, 9, 0, 10, 0, 'other');
    const day = eventsOnDay([late, other, early, span], TODAY);
    expect(day.allDay.map(e => e.title)).toEqual(['span']);
    expect(day.timed.map(e => e.title)).toEqual(['early', 'late']);
  });

  it('includes a timed event that runs past midnight on both days', () => {
    const overnight: CalEvent = { ...timed(17, 22, 0, 23, 0), end: at(18, 2, 0) };
    expect(eventsOnDay([overnight], TODAY).timed).toHaveLength(1);
    expect(eventsOnDay([overnight], addDays(TODAY, 1)).timed).toHaveLength(1);
    expect(eventsOnDay([overnight], addDays(TODAY, 2)).timed).toHaveLength(0);
  });
});

describe('dotCalendarsOnDay', () => {
  it('returns one dot per calendar in first-seen order, capped at three', () => {
    const events = [
      timed(17, 9, 0, 10, 0, 'a1', 'work'), timed(17, 10, 0, 11, 0, 'a2', 'work'),
      timed(17, 11, 0, 12, 0, 'b', 'home'), timed(17, 12, 0, 13, 0, 'c', 'fam'), timed(17, 13, 0, 14, 0, 'd', 'extra'),
    ];
    expect(dotCalendarsOnDay(events, TODAY)).toEqual(['work', 'home', 'fam']);
    expect(dotCalendarsOnDay(events, TODAY, 2)).toEqual(['work', 'home']);
  });

  it('is empty on a day without events', () => {
    expect(dotCalendarsOnDay([timed(18, 9, 0, 10, 0)], TODAY)).toEqual([]);
  });
});

describe('selectNextEvents', () => {
  it('skips finished events and keeps one in progress first', () => {
    const done = timed(17, 9, 0, 10, 0, 'done');
    const live = timed(17, 14, 0, 15, 0, 'live');
    const next = timed(17, 16, 0, 17, 0, 'next');
    const res = selectNextEvents([next, done, live], NOW, 3);
    expect(res.items.map(e => e.title)).toEqual(['live', 'next']);
    expect(res.hidden).toBe(0);
    expect(res.allDay).toBe(false);
  });

  it('puts the earliest-started of two concurrent events first', () => {
    const a = timed(17, 14, 0, 15, 0, 'earlier');
    const b = timed(17, 14, 30, 15, 0, 'later');
    expect(selectNextEvents([b, a], NOW, 1).items.map(e => e.title)).toEqual(['earlier']);
  });

  it('counts what does not fit as hidden', () => {
    const list = [timed(17, 15, 0, 15, 30), timed(17, 16, 0, 16, 30), timed(17, 17, 0, 17, 30), timed(17, 18, 0, 18, 30)];
    const res = selectNextEvents(list, NOW, 3);
    expect(res.items).toHaveLength(3);
    expect(res.hidden).toBe(1);
  });

  it('never lets a multi-day all-day event take a slot while a timed event remains', () => {
    const banner = allDay(16, 18, 'banner');
    const meeting = timed(17, 16, 0, 17, 0, 'meeting');
    expect(selectNextEvents([banner, meeting], NOW, 1).items.map(e => e.title)).toEqual(['meeting']);
  });

  it('falls back to today\'s all-day events when no timed event remains', () => {
    const banner = allDay(16, 18, 'banner');
    const done = timed(17, 9, 0, 10, 0);
    const res = selectNextEvents([banner, done], NOW, 2);
    expect(res.items.map(e => e.title)).toEqual(['banner']);
    expect(res.allDay).toBe(true);
  });

  it('offers tomorrow\'s first event, timed before all-day, when today is empty', () => {
    const tomorrowTimed = timed(18, 10, 0, 11, 0, 'tt');
    const tomorrowAllDay = allDay(18, 18, 'ta');
    const res = selectNextEvents([tomorrowAllDay, tomorrowTimed], NOW, 1);
    expect(res.items).toEqual([]);
    expect(res.tomorrow?.title).toBe('tt');
    expect(selectNextEvents([tomorrowAllDay], NOW, 1).tomorrow?.title).toBe('ta');
  });

  it('has nothing to show on an empty calendar', () => {
    expect(selectNextEvents([], NOW, 3)).toEqual({ items: [], hidden: 0, allDay: false, tomorrow: null });
  });
});

describe('buildUpNext', () => {
  it('lists the rest of today, then tomorrow with all-day rows ahead of timed ones', () => {
    const today = timed(17, 16, 0, 17, 0, 'today');
    const tAll = allDay(18, 18, 'tomorrow-all');
    const tTimed = timed(18, 8, 0, 9, 0, 'tomorrow-timed');
    const up = buildUpNext([today, tTimed, tAll], NOW, 4, 3);
    expect(up.today.map(e => e.title)).toEqual(['today']);
    expect(up.tomorrowAllDay.map(e => e.title)).toEqual(['tomorrow-all']);
    expect(up.tomorrowTimed.map(e => e.title)).toEqual(['tomorrow-timed']);
  });

  it('spends the tomorrow capacity on all-day rows first', () => {
    const rows = [allDay(18, 18, 'a1'), allDay(18, 18, 'a2'), timed(18, 8, 0, 9, 0, 't')];
    const up = buildUpNext(rows, NOW, 4, 2);
    expect(up.tomorrowAllDay).toHaveLength(2);
    expect(up.tomorrowTimed).toHaveLength(0);
  });
});

describe('describeWhen', () => {
  const fmt = (ms: number) => `t${ms}`;
  it('names an in-progress event with its end', () => {
    expect(describeWhen(timed(17, 14, 0, 15, 0), NOW, fmt)).toEqual({ key: 'panel.widget.calendar.when.nowUntil', params: { time: `t${at(17, 15)}` } });
  });
  it('counts minutes under an hour', () => {
    const w = describeWhen(timed(17, 15, 0, 16, 0), NOW, fmt);
    expect(w.key).toBe('panel.widget.calendar.when.inMinutes');
    expect(w.params.count).toBe(25);
  });
  it('splits hours and minutes beyond an hour, dropping zero minutes', () => {
    expect(describeWhen(timed(17, 16, 40, 17, 0), NOW, fmt).params).toMatchObject({ hours: 2, minutes: 5 });
    expect(describeWhen(timed(17, 16, 35, 17, 0), NOW, fmt).key).toBe('panel.widget.calendar.when.inHours');
  });
  it('says all day for an all-day event', () => {
    expect(describeWhen(allDay(17, 17), NOW, fmt).key).toBe('panel.widget.calendar.allDay');
  });
});

describe('describeAgo and syncedText', () => {
  const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ''}`;
  it('picks the largest unit', () => {
    expect(describeAgo(NOW - 20_000, NOW).key).toBe('panel.widget.calendar.ago.justNow');
    expect(describeAgo(NOW - 12 * 60_000, NOW)).toEqual({ key: 'panel.widget.calendar.ago.minutes', params: { count: 12 } });
    expect(describeAgo(NOW - 3 * 3_600_000, NOW)).toEqual({ key: 'panel.widget.calendar.ago.hours', params: { count: 3 } });
    expect(describeAgo(NOW - 50 * 3_600_000, NOW)).toEqual({ key: 'panel.widget.calendar.ago.days', params: { count: 2 } });
  });
  it('uses the never text without a sync time and the kind form when asked', () => {
    expect(syncedText(t, null, NOW)).toContain('syncedNever');
    expect(syncedText(t, null, NOW, 'ICS')).toContain('source.subNever');
    expect(syncedText(t, NOW - 12 * 60_000, NOW, 'ICS')).toContain('source.sub');
  });
});

describe('layoutDaySegments', () => {
  it('places overlapping events side by side and leaves lone ones full width', () => {
    const a = timed(17, 14, 0, 15, 0, 'a');
    const b = timed(17, 14, 30, 15, 0, 'b');
    const c = timed(17, 16, 0, 17, 0, 'c');
    const seg = layoutDaySegments([a, b, c], TODAY);
    const by = Object.fromEntries(seg.map(s => [s.ev.title, s]));
    expect(by.a).toMatchObject({ col: 0, cols: 2 });
    expect(by.b).toMatchObject({ col: 1, cols: 2 });
    expect(by.c).toMatchObject({ col: 0, cols: 1 });
  });

  it('reuses a freed column inside one cluster', () => {
    const long = timed(17, 9, 0, 12, 0, 'long');
    const s1 = timed(17, 9, 0, 10, 0, 's1');
    const s2 = timed(17, 10, 0, 11, 0, 's2');
    const seg = layoutDaySegments([long, s1, s2], TODAY);
    const by = Object.fromEntries(seg.map(s => [s.ev.title, s]));
    expect(by.s1.cols).toBe(2);
    expect(by.s2.col).toBe(by.s1.col);
  });

  it('clips an overnight event to the day', () => {
    const overnight: CalEvent = { ...timed(17, 22, 0, 23, 0), end: at(18, 2, 0) };
    expect(layoutDaySegments([overnight], TODAY)[0]).toMatchObject({ startMin: 22 * 60, endMin: 24 * 60 });
    expect(layoutDaySegments([overnight], addDays(TODAY, 1))[0]).toMatchObject({ startMin: 0, endMin: 2 * 60 });
  });
});

describe('layoutAllDayLanes', () => {
  const week = Array.from({ length: 7 }, (_, i) => at(15 + i));
  it('packs overlapping spans into separate lanes and reuses a lane after a span ends', () => {
    const lanes = layoutAllDayLanes([allDay(15, 17, 'one'), allDay(16, 18, 'two'), allDay(19, 20, 'three')], week);
    const by = Object.fromEntries(lanes.map(l => [l.ev.title, l]));
    expect(by.one).toMatchObject({ startCol: 0, endCol: 2, lane: 0 });
    expect(by.two).toMatchObject({ startCol: 1, endCol: 3, lane: 1 });
    expect(by.three.lane).toBe(0);
  });

  it('flags spans that continue past the visible week', () => {
    const [lane] = layoutAllDayLanes([allDay(13, 17, 'long')], week);
    expect(lane).toMatchObject({ startCol: 0, endCol: 2, continuesBefore: true, continuesAfter: false });
  });
});

describe('monthWeeks and planMonthWeek', () => {
  it('covers November 2026 in five Sunday-first weeks', () => {
    const weeks = monthWeeks(startOfMonth(NOW), 0);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe(at(1));
    expect(weeks[4][6]).toBe(at(35));
  });

  it('starts Monday-first weeks on Monday', () => {
    expect(new Date(monthWeeks(startOfMonth(NOW), 1)[0][0]).getDay()).toBe(1);
    expect(new Date(startOfWeek(NOW, 1)).getDay()).toBe(1);
    expect(new Date(startOfWeek(NOW, 0)).getDay()).toBe(0);
  });

  it('folds timed events that do not fit into "+N more"', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const events = [timed(17, 9, 0, 10, 0), timed(17, 10, 0, 11, 0), timed(17, 11, 0, 12, 0), timed(17, 12, 0, 13, 0)];
    const plan = planMonthWeek(events, week, 3);
    const idx = week.indexOf(TODAY);
    expect(plan.perDay[idx].lines).toHaveLength(2);
    expect(plan.perDay[idx].more).toBe(2);
  });

  it('gives lane rows to all-day bars before timed events', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const plan = planMonthWeek([allDay(16, 18, 'bar'), timed(17, 9, 0, 10, 0), timed(17, 10, 0, 11, 0), timed(17, 11, 0, 12, 0)], week, 3);
    const idx = week.indexOf(TODAY);
    expect(plan.bars).toHaveLength(1);
    expect(plan.perDay[idx].lines).toHaveLength(1);
    expect(plan.perDay[idx].more).toBe(2);
  });

  it('counts all-day bars that overflow the row budget into "more"', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const plan = planMonthWeek([allDay(16, 18, 'a'), allDay(16, 18, 'b'), allDay(16, 18, 'c')], week, 2);
    expect(plan.bars).toHaveLength(1);
    expect(plan.perDay[week.indexOf(TODAY)]).toEqual({ lines: [], more: 2 });
  });

  it('lets bars fill every row when nothing else needs one', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const plan = planMonthWeek([allDay(16, 18, 'a'), allDay(16, 18, 'b')], week, 2);
    expect(plan.bars).toHaveLength(2);
    expect(plan.perDay.every(d => d.more === 0)).toBe(true);
  });

  it('keeps a row for "+N more" when bars and timed events compete', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const plan = planMonthWeek([allDay(16, 18, 'a'), allDay(16, 18, 'b'), timed(17, 9, 0, 10, 0)], week, 2);
    expect(plan.bars).toHaveLength(1);
    expect(plan.perDay[week.indexOf(TODAY)].more).toBe(2);
  });

  it('shows only "+N more" when there is a single row', () => {
    const week = monthWeeks(startOfMonth(NOW), 0)[2];
    const plan = planMonthWeek([allDay(16, 18, 'a'), timed(17, 9, 0, 10, 0)], week, 1);
    expect(plan.bars).toHaveLength(0);
    expect(plan.perDay[week.indexOf(TODAY)]).toEqual({ lines: [], more: 2 });
  });
});

describe('groupAgenda', () => {
  it('keeps only days with events, all-day first', () => {
    const groups = groupAgenda([timed(17, 9, 0, 10, 0, 't'), allDay(17, 17, 'a'), timed(20, 9, 0, 10, 0)], TODAY, 7);
    expect(groups.map(g => g.day)).toEqual([TODAY, at(20)]);
    expect(groups[0].events.map(e => e.title)).toEqual(['a', 't']);
  });
});

describe('config resolution', () => {
  it('maps the retired showGrid toggle to grid plus events without needing the new keys', () => {
    expect(resolveCalendarDisplay({ showGrid: true })).toEqual({ grid: true, events: true });
    expect(resolveCalendarDisplay({ showGrid: false })).toEqual({ grid: false, events: false });
    expect(resolveCalendarDisplay(undefined)).toEqual({ grid: false, events: false });
  });
  it('shows the grid only when both are stored at a size without room for the list', () => {
    const both = { showGrid: true, showEvents: true };
    expect(resolveCalendarDisplay(both, '4x4')).toEqual({ grid: true, events: true });
    for (const size of ['2x2', '2x4', '4x2', '2x2round']) expect(resolveCalendarDisplay(both, size)).toEqual({ grid: true, events: false });
    expect(resolveCalendarDisplay({ showGrid: false, showEvents: true }, '4x2')).toEqual({ grid: false, events: true });
  });
  it('prefers the stored toggles over older keys', () => {
    expect(resolveCalendarDisplay({ showGrid: true, showEvents: false })).toEqual({ grid: true, events: false });
    expect(resolveCalendarDisplay({ showGrid: false, showEvents: true })).toEqual({ grid: false, events: true });
  });
  it('defaults the immersive view by orientation', () => {
    expect(resolveImmersiveView(undefined, true)).toBe('week');
    expect(resolveImmersiveView(undefined, false)).toBe('day');
    expect(resolveImmersiveView({ immersiveView: 'list' }, true)).toBe('list');
    expect(resolveImmersiveView({ immersiveView: 'auto' }, false)).toBe('day');
  });
});
