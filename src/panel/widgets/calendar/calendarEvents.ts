import type { CalendarEventDto } from '../../../api/calendar';

// Normalized event: every instant is a local-time epoch ms. An all-day event
// runs from local midnight of its first day to local midnight after its last,
// so it follows the viewer's calendar days instead of shifting with the zone.
export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  location: string | null;
  notes: string | null;
  allDay: boolean;
  start: number;
  end: number;
  tentative: boolean;
}

export type ImmersiveView = 'day' | 'week' | 'month' | 'list';

export const IMMERSIVE_VIEWS: readonly ImmersiveView[] = ['day', 'week', 'month', 'list'];

export const MAX_EVENT_DOTS = 3;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Local midnight for a YYYY-MM-DD date, or null when the text is not one. */
export function parseDateKey(key: string | null): number | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** Sunday-first (0) or Monday-first (1) start of the week containing `ms`. */
export function startOfWeek(ms: number, weekStart: 0 | 1): number {
  const day = startOfDay(ms);
  const dow = new Date(day).getDay();
  return addDays(day, -((dow - weekStart + 7) % 7));
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
}

export function normalizeEvent(dto: CalendarEventDto): CalEvent {
  let start = dto.start;
  let end = dto.end;
  if (dto.allDay) {
    const s = parseDateKey(dto.startDate);
    if (s !== null) {
      start = s;
      const e = parseDateKey(dto.endDate);
      end = e !== null && e > s ? e : addDays(s, 1);
    } else {
      start = startOfDay(dto.start);
      end = Math.max(addDays(start, 1), startOfDay(dto.end));
    }
  } else if (end < start) {
    end = start;
  }
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    title: dto.title,
    location: dto.location,
    notes: dto.notes,
    allDay: dto.allDay,
    start,
    end,
    tentative: dto.status === 'tentative',
  };
}

const byStart = (a: CalEvent, b: CalEvent) => a.start - b.start || a.end - b.end || a.title.localeCompare(b.title);
const byLongestFirst = (a: CalEvent, b: CalEvent) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.title.localeCompare(b.title);

export interface DayEvents {
  allDay: CalEvent[];
  timed: CalEvent[];
}

/** Events touching one calendar day: all-day first, then timed by start. */
export function eventsOnDay(events: readonly CalEvent[], dayStart: number): DayEvents {
  const dayEnd = addDays(dayStart, 1);
  const allDay: CalEvent[] = [];
  const timed: CalEvent[] = [];
  for (const ev of events) {
    if (ev.allDay) {
      if (ev.start <= dayStart && ev.end > dayStart) allDay.push(ev);
    } else if (ev.start < dayEnd && (ev.end > dayStart || (ev.end === ev.start && ev.start >= dayStart))) {
      timed.push(ev);
    }
  }
  return { allDay: allDay.sort(byLongestFirst), timed: timed.sort(byStart) };
}

/** One dot per calendar with an event that day, in order of first appearance, capped. */
export function dotCalendarsOnDay(events: readonly CalEvent[], dayStart: number, max: number = MAX_EVENT_DOTS): string[] {
  const day = eventsOnDay(events, dayStart);
  const seen: string[] = [];
  for (const ev of [...day.allDay, ...day.timed]) {
    if (!seen.includes(ev.calendarId)) seen.push(ev.calendarId);
    if (seen.length >= max) break;
  }
  return seen;
}

export interface NextEvents {
  items: CalEvent[];
  hidden: number;
  // The items are all-day events: no timed event remains today.
  allDay: boolean;
  // Set only when nothing remains today.
  tomorrow: CalEvent | null;
}

/**
 * What a small tile lists. Timed events that have not ended, earliest start
 * first (so of two concurrent events the earlier one leads). All-day events,
 * single or multi-day, fill a slot only when no timed event remains today.
 */
export function selectNextEvents(events: readonly CalEvent[], now: number, capacity: number): NextEvents {
  const today = startOfDay(now);
  const day = eventsOnDay(events, today);
  const remaining = day.timed.filter(ev => ev.end > now || ev.start >= now);
  if (remaining.length > 0) {
    return { items: remaining.slice(0, capacity), hidden: Math.max(0, remaining.length - capacity), allDay: false, tomorrow: null };
  }
  if (day.allDay.length > 0) {
    return { items: day.allDay.slice(0, capacity), hidden: Math.max(0, day.allDay.length - capacity), allDay: true, tomorrow: null };
  }
  const next = eventsOnDay(events, addDays(today, 1));
  return { items: [], hidden: 0, allDay: false, tomorrow: next.timed[0] ?? next.allDay[0] ?? null };
}

export interface UpNext {
  today: CalEvent[];
  todayHidden: number;
  todayAllDay: boolean;
  tomorrowAllDay: CalEvent[];
  tomorrowTimed: CalEvent[];
}

/** The 4x4 Up Next layout: what remains today, then tomorrow with all-day rows first. */
export function buildUpNext(events: readonly CalEvent[], now: number, todayCapacity: number, tomorrowCapacity: number): UpNext {
  const today = selectNextEvents(events, now, todayCapacity);
  const tomorrow = eventsOnDay(events, addDays(startOfDay(now), 1));
  const tomorrowAllDay = tomorrow.allDay.slice(0, tomorrowCapacity);
  return {
    today: today.items,
    todayHidden: today.hidden,
    todayAllDay: today.allDay,
    tomorrowAllDay,
    tomorrowTimed: tomorrow.timed.slice(0, Math.max(0, tomorrowCapacity - tomorrowAllDay.length)),
  };
}

export interface WhenText {
  key: string;
  params: Record<string, string | number>;
}

/** Message key and params for "Now, until 3:30 PM" / "In 25 min, 3:00 PM" / "All day". */
export function describeWhen(ev: CalEvent, now: number, formatTime: (ms: number) => string): WhenText {
  if (ev.allDay) return { key: 'panel.widget.calendar.allDay', params: {} };
  if (ev.start <= now) return { key: 'panel.widget.calendar.when.nowUntil', params: { time: formatTime(ev.end) } };
  const minutes = Math.max(1, Math.round((ev.start - now) / 60_000));
  const time = formatTime(ev.start);
  if (minutes < 60) return { key: 'panel.widget.calendar.when.inMinutes', params: { count: minutes, time } };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return { key: 'panel.widget.calendar.when.inHours', params: { hours, time } };
  return { key: 'panel.widget.calendar.when.inHoursMinutes', params: { hours, minutes: rest, time } };
}

/** Message key and params for how long ago a sync finished, e.g. "12 min ago". */
export function describeAgo(syncedAt: number, now: number): WhenText {
  const minutes = Math.max(0, Math.floor((now - syncedAt) / 60_000));
  if (minutes < 1) return { key: 'panel.widget.calendar.ago.justNow', params: {} };
  if (minutes < 60) return { key: 'panel.widget.calendar.ago.minutes', params: { count: minutes } };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'panel.widget.calendar.ago.hours', params: { count: hours } };
  return { key: 'panel.widget.calendar.ago.days', params: { count: Math.floor(hours / 24) } };
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** "Synced 12 min ago", or the never-synced text. With `kind`, "ICS feed, synced 12 min ago". */
export function syncedText(t: Translate, syncedAt: number | null, now: number, kind?: string): string {
  const prefix = kind === undefined ? 'panel.widget.calendar.synced' : 'panel.widget.calendar.source.sub';
  if (syncedAt === null) return t(kind === undefined ? 'panel.widget.calendar.syncedNever' : 'panel.widget.calendar.source.subNever', { kind: kind ?? '' });
  const ago = describeAgo(syncedAt, now);
  return t(prefix, { ago: t(ago.key, ago.params), kind: kind ?? '' });
}

// ── Timeline (Day / Week) ───────────────────────────────────────

export interface TimeSegment {
  ev: CalEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

const MINUTES_PER_DAY = 24 * 60;

function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Timed events of one day clipped to it, with side-by-side columns for events
 * that overlap: each cluster of transitively overlapping events shares its
 * widest column count.
 */
export function layoutDaySegments(events: readonly CalEvent[], dayStart: number): TimeSegment[] {
  const dayEnd = addDays(dayStart, 1);
  const timed = eventsOnDay(events, dayStart).timed;
  const items = timed.map(ev => ({
    ev,
    startMin: ev.start <= dayStart ? 0 : minuteOfDay(ev.start),
    endMin: ev.end >= dayEnd ? MINUTES_PER_DAY : minuteOfDay(ev.end),
  }));
  const out: TimeSegment[] = [];
  let cluster: typeof items = [];
  let clusterEnd = 0;
  const flush = () => {
    const colEnds: number[] = [];
    const cols = cluster.map(item => {
      let col = colEnds.findIndex(end => end <= item.startMin);
      if (col < 0) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = Math.max(item.endMin, item.startMin + 1);
      return col;
    });
    cluster.forEach((item, i) => out.push({ ...item, col: cols[i], cols: colEnds.length }));
    cluster = [];
  };
  for (const item of items) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) { flush(); clusterEnd = 0; }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin, item.startMin + 1);
  }
  if (cluster.length > 0) flush();
  return out;
}

// ── All-day lanes and month weeks ───────────────────────────────

export interface LaneItem {
  ev: CalEvent;
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** All-day events across a run of consecutive days, packed into lanes. */
export function layoutAllDayLanes(events: readonly CalEvent[], days: readonly number[]): LaneItem[] {
  if (days.length === 0) return [];
  const first = days[0];
  const lastEnd = addDays(days[days.length - 1], 1);
  const candidates = events
    .filter(ev => ev.allDay && ev.start < lastEnd && ev.end > first)
    .sort(byLongestFirst);
  const laneEnds: number[] = [];
  const out: LaneItem[] = [];
  for (const ev of candidates) {
    const covered = days.map((d, i) => (ev.start <= d && ev.end > d ? i : -1)).filter(i => i >= 0);
    if (covered.length === 0) continue;
    const startCol = covered[0];
    const endCol = covered[covered.length - 1];
    let lane = laneEnds.findIndex(end => end < startCol);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(endCol); } else laneEnds[lane] = endCol;
    out.push({ ev, startCol, endCol, lane, continuesBefore: ev.start < first, continuesAfter: ev.end > lastEnd });
  }
  return out;
}

export interface MonthDayPlan {
  lines: CalEvent[];
  more: number;
}

export interface MonthWeekPlan {
  days: number[];
  bars: LaneItem[];
  perDay: MonthDayPlan[];
}

/** Local midnights of every day in the weeks that cover `monthStart`'s month. */
export function monthWeeks(monthStart: number, weekStart: 0 | 1): number[][] {
  const first = startOfWeek(monthStart, weekStart);
  const monthIndex = new Date(monthStart).getMonth();
  const weeks: number[][] = [];
  let cursor = first;
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    if (w > 0 && new Date(days[0]).getMonth() !== monthIndex) break;
    weeks.push(days);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/**
 * One month row sized to `maxRows` event rows under the day numbers: all-day
 * bars take the first rows, timed events fill what is left, and whatever does
 * not fit folds into a "+N more" count that keeps a row of its own.
 */
export function planMonthWeek(events: readonly CalEvent[], days: readonly number[], maxRows: number): MonthWeekPlan {
  const lanes = layoutAllDayLanes(events, days);
  const needed = lanes.length === 0 ? 0 : Math.max(...lanes.map(l => l.lane)) + 1;
  const dayEvents = days.map(day => eventsOnDay(events, day).timed);
  const anyTimed = dayEvents.some(timed => timed.length > 0);
  // Bars may fill every row only when nothing else needs one, else the last row is kept for "+N more".
  const laneCount = needed <= maxRows && !anyTimed ? needed : Math.min(needed, Math.max(0, maxRows - 1));
  const bars = lanes.filter(l => l.lane < laneCount);
  const hiddenBars = lanes.filter(l => l.lane >= laneCount);
  const budget = maxRows - laneCount;
  const perDay = days.map((_, i) => {
    const timed = dayEvents[i];
    const barsHere = hiddenBars.filter(l => l.startCol <= i && l.endCol >= i).length;
    if (timed.length + barsHere <= budget) return { lines: timed, more: 0 };
    const lines = timed.slice(0, Math.max(0, budget - 1));
    return { lines, more: timed.length - lines.length + barsHere };
  });
  return { days: [...days], bars, perDay };
}

/** Events in a list view: days from `from` that have any, up to `maxDays` days scanned. */
export function groupAgenda(events: readonly CalEvent[], from: number, maxDays: number): { day: number; events: CalEvent[] }[] {
  const out: { day: number; events: CalEvent[] }[] = [];
  for (let i = 0; i < maxDays; i++) {
    const day = addDays(from, i);
    const d = eventsOnDay(events, day);
    const all = [...d.allDay, ...d.timed];
    if (all.length > 0) out.push({ day, events: all });
  }
  return out;
}

// ── Config ──────────────────────────────────────────────────────

export interface CalendarDisplay {
  grid: boolean;
  events: boolean;
}

/**
 * The two display toggles. Stored `showGrid` / `showEvents` win; a config with
 * only the retired `showGrid` toggle, whose grid carried the event list, reads
 * as grid plus events without being rewritten.
 * Pass `size` to apply the one-of-the-two rule of the sizes that cannot hold both.
 */
export function resolveCalendarDisplay(config: Record<string, unknown> | undefined, size?: string): CalendarDisplay {
  const grid = config?.showGrid === true;
  let events = typeof config?.showEvents === 'boolean' ? config.showEvents : grid;
  // Only the 4x4 has room for both; elsewhere the grid wins, without rewriting the stored keys.
  if (size !== undefined && size !== '4x4' && grid && events) events = false;
  return { grid, events };
}

/** Whether a size can show the month grid and the event list together. */
export function supportsGridAndEvents(size: string): boolean {
  return size === '4x4';
}

export function resolveImmersiveView(config: Record<string, unknown> | undefined, landscape: boolean): ImmersiveView {
  const view = config?.immersiveView;
  if (typeof view === 'string' && (IMMERSIVE_VIEWS as readonly string[]).includes(view)) return view as ImmersiveView;
  return landscape ? 'week' : 'day';
}

export function hiddenCalendarIds(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.hiddenCalendars;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}
