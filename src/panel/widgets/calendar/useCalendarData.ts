import { useMemo } from 'react';
import type { CalendarSourceDto } from '../../../api/calendar';
import { useCalendarEvents, useCalendarSources } from '../../../hooks/useCalendar';
import { normalizeEvent, type CalEvent } from './calendarEvents';
import { buildPreviewEvents, PREVIEW_SOURCES } from './calendarPreviewData';

const PREVIEW_HOUR = 14;
const PREVIEW_MINUTE = 35;

/** The catalog preview's pretend clock: today at a fixed time, so the fixture always reads the same. */
export function previewNow(real: number): number {
  const d = new Date(real);
  d.setHours(PREVIEW_HOUR, PREVIEW_MINUTE, 0, 0);
  return d.getTime();
}

export interface CalendarLook {
  name: string;
  color: string;
}

export interface CalendarData {
  events: CalEvent[];
  sources: CalendarSourceDto[];
  loaded: boolean;
  truncated: boolean;
  lookFor: (calendarId: string) => CalendarLook;
}

const UNKNOWN_COLOR = '#8e8e93';

interface Options {
  from: number;
  to: number;
  hidden?: readonly string[];
  // False skips every fetch and subscription (tiles that show no events).
  enabled: boolean;
  // Catalog preview: fixture events, no I/O.
  preview: boolean;
  now: number;
}

export function useCalendarData({ from, to, hidden = [], enabled, preview, now }: Options): CalendarData {
  const live = enabled && !preview;
  const { sources: liveSources, loaded: sourcesLoaded } = useCalendarSources(live);
  const { events: liveEvents, loaded: eventsLoaded, truncated } = useCalendarEvents(from, to, hidden, live);
  const previewEvents = useMemo(
    () => (preview ? buildPreviewEvents(now).map(normalizeEvent) : []),
    // The fixture is anchored to the day, not the minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, new Date(now).toDateString()],
  );
  const sources = preview ? PREVIEW_SOURCES : liveSources;
  const events = preview ? previewEvents : liveEvents;
  const lookFor = useMemo(() => {
    const byId = new Map(sources.map(s => [s.id, { name: s.name, color: s.color }]));
    return (id: string): CalendarLook => byId.get(id) ?? { name: '', color: UNKNOWN_COLOR };
  }, [sources]);
  return { events, sources, loaded: preview || (sourcesLoaded && eventsLoaded), truncated: !preview && truncated, lookFor };
}
