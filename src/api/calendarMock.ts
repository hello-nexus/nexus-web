// Dev-tools calendar fixtures: an in-memory stand-in for the service routes,
// loaded only behind the raw build guard in api/calendar.ts.

import type {
  AddCalendarInput, CalendarEventDto, CalendarEventsResult, CalendarRefreshMinutes, CalendarSettingsDto,
  CalendarSourceDto, CalendarAddError,
} from './calendar';
import { allDayEvent, timedEvent } from '../panel/widgets/calendar/calendarPreviewData';

const MIN = 60_000;
const now0 = Date.now();

let sources: CalendarSourceDto[] = [
  { id: 'mock-work', kind: 'ics', name: 'Work', color: '#8b7cff', host: 'calendar.google.com', lastSyncedAt: now0 - 12 * MIN, status: 'ok', error: null },
  { id: 'mock-personal', kind: 'ics', name: 'Personal', color: '#ff9f0a', host: 'outlook.live.com', lastSyncedAt: now0 - 12 * MIN, status: 'ok', error: null },
  { id: 'mock-family', kind: 'ics', name: 'Family', color: '#32d74b', host: 'p01-caldav.icloud.com', lastSyncedAt: now0 - 60 * MIN, status: 'ok', error: null },
];
let refreshMinutes: CalendarRefreshMinutes = 15;
let lastRefresh: number | null = now0 - 12 * MIN;
let nextId = 1;
const listeners = new Set<() => void>();

/** The mock has no socket: the store subscribes here for the same refetch signal a topic frame gives. */
export function onMockCalendarChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function changed() {
  listeners.forEach(l => l());
}

export function mockSources(): CalendarSourceDto[] {
  return sources.map(s => ({ ...s }));
}

export function mockSettings(): CalendarSettingsDto {
  return { refreshMinutes, lastSyncedAt: lastRefresh, syncing: false };
}

export function mockSetRefreshMinutes(value: CalendarRefreshMinutes): CalendarSettingsDto {
  refreshMinutes = value;
  changed();
  return mockSettings();
}

export function mockRefresh(): void {
  const stamp = Date.now();
  lastRefresh = stamp;
  sources = sources.map(s => ({ ...s, lastSyncedAt: stamp }));
  changed();
}

// The dev mock keeps the feed address per added source, as the service does, to refuse a repeat.
const addedFeeds = new Map<string, string>();

function feedIdentity(url: URL): string {
  // WHATWG host is lowercased and empty-ported only for the scheme's own default port.
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
}

export function mockAddSource(input: AddCalendarInput): { source: CalendarSourceDto } | { error: CalendarAddError } {
  if (!/^(https?|webcal):\/\//i.test(input.url.trim())) return { error: 'invalidUrl' };
  let host: string | null = null;
  try { host = new URL(input.url.trim().replace(/^webcal:/i, 'https:')).hostname; } catch { return { error: 'notIcs' }; }
  const key = feedIdentity(new URL(input.url.trim().replace(/^webcal:/i, 'https:')));
  const existing = addedFeeds.get(key);
  if (existing && sources.some(s => s.id === existing)) return { error: 'duplicate' };
  const source: CalendarSourceDto = {
    id: `mock-added-${nextId++}`, kind: 'ics', name: input.name.trim() || host, color: input.color, host,
    lastSyncedAt: Date.now(), status: 'ok', error: null,
  };
  addedFeeds.set(key, source.id);
  sources = [...sources, source];
  changed();
  return { source };
}

export function mockProbe(url: string): { probe: { name: string | null; host: string } } | { error: CalendarAddError } {
  const address = url.trim();
  if (!/^(https?|webcal):\/\//i.test(address)) return { error: 'invalidUrl' };
  try {
    const parsed = new URL(address.replace(/^webcal:/i, 'https:'));
    const leaf = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.ics$/i, '');
    const words = leaf.replace(/[-_]+/g, ' ').trim();
    const name = words && !/^basic$/i.test(words) ? words.replace(/\b\w/g, c => c.toUpperCase()) : null;
    return { probe: { name, host: parsed.hostname } };
  } catch {
    return { error: 'invalidUrl' };
  }
}

export function mockUpdateSource(id: string, patch: { name?: string; color?: string }): CalendarSourceDto | null {
  const current = sources.find(s => s.id === id);
  if (!current) return null;
  const next = { ...current, name: patch.name === undefined ? current.name : patch.name.trim() || current.host || current.name, color: patch.color ?? current.color };
  sources = sources.map(s => (s.id === id ? next : s));
  changed();
  return { ...next };
}

export function mockRemoveSource(id: string): void {
  sources = sources.filter(s => s.id !== id);
  changed();
}

function dayAt(base: number, offset: number, hour: number, minute = 0): number {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

// Dates are relative to today, so the busy-day shapes (overlap, in-progress,
// late evening, multi-day) are always visible whatever day it is.
function generate(from: number, to: number): CalendarEventDto[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const base = today.getTime();
  const out: CalendarEventDto[] = [];
  const first = Math.floor((from - base) / (24 * 60 * MIN)) - 1;
  const last = Math.ceil((to - base) / (24 * 60 * MIN)) + 1;
  for (let offset = first; offset <= last; offset++) {
    const dow = new Date(dayAt(base, offset, 12)).getDay();
    if (dow !== 0 && dow !== 6) out.push(timedEvent(`mock-${offset}-standup`, 'mock-work', 'Standup', dayAt(base, offset, 9), dayAt(base, offset, 9, 30), 'Video call'));
    if (dow === 1 || dow === 3) out.push(timedEvent(`mock-${offset}-gym`, 'mock-personal', 'Gym', dayAt(base, offset, 7), dayAt(base, offset, 8)));
    if (dow === 2) out.push(timedEvent(`mock-${offset}-sprint`, 'mock-work', 'Sprint planning', dayAt(base, offset, 10), dayAt(base, offset, 11, 30), 'Room 2A'));
    if (dow === 4) out.push(timedEvent(`mock-${offset}-one`, 'mock-work', '1:1 with Sam', dayAt(base, offset, 11), dayAt(base, offset, 11, 30), 'Video call'));
    if (dow === 5) out.push(timedEvent(`mock-${offset}-book`, 'mock-personal', 'Book club', dayAt(base, offset, 19), dayAt(base, offset, 21), 'Maya\'s place'));
    if (dow === 6) out.push(timedEvent(`mock-${offset}-soccer`, 'mock-family', 'Soccer game', dayAt(base, offset, 10), dayAt(base, offset, 11, 30), 'North field'));
    if (dow === 0) out.push(timedEvent(`mock-${offset}-visit`, 'mock-family', 'Visit grandparents', dayAt(base, offset, 11), dayAt(base, offset, 15)));
  }
  const rel = (offset: number) => dayAt(base, offset, 12);
  const fixed: CalendarEventDto[] = [
    allDayEvent('mock-a1', 'mock-work', 'Launch week', rel(-1), rel(1)),
    timedEvent('mock-t1', 'mock-work', 'Design review', dayAt(base, 0, 14), dayAt(base, 0, 15), 'Studio'),
    timedEvent('mock-t2', 'mock-work', '1:1 with Sam', dayAt(base, 0, 14, 30), dayAt(base, 0, 15), 'Video call'),
    timedEvent('mock-t3', 'mock-personal', 'Lunch with Maya', dayAt(base, 0, 12, 30), dayAt(base, 0, 13, 30), 'Corner Cafe'),
    timedEvent('mock-t4', 'mock-family', 'Pick up Leo', dayAt(base, 0, 16), dayAt(base, 0, 16, 30), 'School'),
    timedEvent('mock-t5', 'mock-family', 'Soccer practice', dayAt(base, 0, 18, 30), dayAt(base, 0, 19, 30), 'North field'),
    timedEvent('mock-t6', 'mock-personal', 'Dinner at Luigi\'s', dayAt(base, 0, 20), dayAt(base, 0, 22), 'Luigi\'s'),
    timedEvent('mock-t7', 'mock-work', 'Late deploy window', dayAt(base, 0, 22, 30), dayAt(base, 0, 23, 30), 'Remote'),
    timedEvent('mock-t8', 'mock-personal', 'Yoga', dayAt(base, 1, 7, 30), dayAt(base, 1, 8, 15), 'Studio Flow'),
    allDayEvent('mock-a2', 'mock-work', 'Team offsite', rel(1), rel(3), 'Lisbon'),
    allDayEvent('mock-a3', 'mock-personal', 'Alex\'s birthday', rel(5), rel(5)),
    allDayEvent('mock-a4', 'mock-family', 'Ski weekend', rel(11), rel(12), 'Tahoe'),
    timedEvent('mock-t9', 'mock-family', 'Family movie night', dayAt(base, 3, 20), dayAt(base, 3, 22), 'Home'),
    timedEvent('mock-t10', 'mock-personal', 'Dentist', dayAt(base, 6, 17), dayAt(base, 6, 17, 45), 'Dr. Okafor'),
    timedEvent('mock-t11', 'mock-work', 'Quarter planning', dayAt(base, 14, 9), dayAt(base, 14, 12), 'Main hall'),
  ];
  const longLink = (n: number) => `https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup-join%2F${'19%3Ameeting_Zm'.repeat(18)}${n}&data=05%7C02%7C`;
  const longNotes = Array.from({ length: 60 }, (_, i) => (i % 9 === 0 ? `Join the meeting: ${longLink(i)}` : i % 9 === 4 ? '\n\n\n\n' : `Agenda item ${i + 1}: review the numbers and decide next steps.`)).join('\n');
  fixed.push({ ...timedEvent('mock-long', 'mock-work', 'Weekly review (long notes)', dayAt(base, 0, 17), dayAt(base, 0, 18), 'Teams meeting'), notes: longNotes });
  const withNotes = fixed.map(e => (e.id === 'mock-t1' ? { ...e, notes: 'Bring the updated mockups and the usage numbers from last sprint.' } : e));
  return [...out, ...withNotes];
}

export function mockEvents(from: number, to: number): CalendarEventsResult {
  const visible = new Set(sources.map(s => s.id));
  const events = generate(from, to).filter(e => visible.has(e.calendarId) && e.end > from && e.start < to);
  return { events, syncedAt: lastRefresh };
}
