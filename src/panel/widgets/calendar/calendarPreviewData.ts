import type { CalendarEventDto, CalendarSourceDto } from '../../../api/calendar';

// Catalog preview fixture: untranslated sample content, relative to `now`.
export const PREVIEW_SOURCES: CalendarSourceDto[] = [
  { id: 'preview-work', kind: 'ics', name: 'Work', color: '#8b7cff', host: null, lastSyncedAt: null, status: 'ok', error: null },
  { id: 'preview-personal', kind: 'ics', name: 'Personal', color: '#ff9f0a', host: null, lastSyncedAt: null, status: 'ok', error: null },
  { id: 'preview-family', kind: 'ics', name: 'Family', color: '#32d74b', host: null, lastSyncedAt: null, status: 'ok', error: null },
];

function at(now: number, dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timedEvent(
  id: string, calendarId: string, title: string, start: number, end: number, location: string | null = null,
): CalendarEventDto {
  return {
    id, calendarId, title, location, notes: null, allDay: false, start, end,
    startDate: null, endDate: null, status: 'confirmed', providerId: null, etag: null,
  };
}

/** `lastDay` is inclusive. */
export function allDayEvent(
  id: string, calendarId: string, title: string, firstMs: number, lastMs: number, location: string | null = null,
): CalendarEventDto {
  const end = new Date(lastMs);
  end.setDate(end.getDate() + 1);
  return {
    id, calendarId, title, location, notes: null, allDay: true, start: firstMs, end: end.getTime(),
    startDate: dateKey(firstMs), endDate: dateKey(end.getTime()), status: 'confirmed', providerId: null, etag: null,
  };
}

export function buildPreviewEvents(now: number): CalendarEventDto[] {
  const day = (offset: number) => at(now, offset, 12);
  return [
    timedEvent('pv1', 'preview-work', 'Standup', at(now, 0, 9), at(now, 0, 9, 30), 'Video call'),
    timedEvent('pv2', 'preview-work', 'Design review', at(now, 0, 14), at(now, 0, 15), 'Studio'),
    timedEvent('pv3', 'preview-family', 'Pick up Leo', at(now, 0, 16), at(now, 0, 16, 30), 'School'),
    timedEvent('pv4', 'preview-personal', 'Dinner at Luigi\'s', at(now, 0, 20), at(now, 0, 22), 'Luigi\'s'),
    timedEvent('pv5', 'preview-personal', 'Yoga', at(now, 1, 7, 30), at(now, 1, 8, 15), 'Studio Flow'),
    allDayEvent('pv6', 'preview-work', 'Team offsite', day(1), day(3), 'Lisbon'),
    timedEvent('pv7', 'preview-family', 'Family movie night', at(now, 3, 20), at(now, 3, 22), 'Home'),
    timedEvent('pv8', 'preview-work', 'Sprint planning', at(now, 7, 10), at(now, 7, 11, 30), 'Room 2A'),
  ];
}
