import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReminderDto, ReminderListDto } from '../../../api/reminders';
import { useReminders } from '../../../hooks/useReminders';
import { buildPreviewReminders, PREVIEW_LISTS } from './reminderPreviewData';

const PREVIEW_HOUR = 14;
const PREVIEW_MINUTE = 35;
/** How long a checked circle shows its completed state before the row leaves. */
export const COMPLETE_DELAY_MS = 800;

/** The catalog preview's pretend clock: today at a fixed time, so the fixture always reads the same. */
export function previewNow(real: number): number {
  const d = new Date(real);
  d.setHours(PREVIEW_HOUR, PREVIEW_MINUTE, 0, 0);
  return d.getTime();
}

export interface ReminderData {
  lists: ReminderListDto[];
  items: ReminderDto[];
  loaded: boolean;
  unavailable: boolean;
}

interface Options {
  // False skips every fetch and subscription.
  enabled: boolean;
  // Catalog preview: fixture data, no I/O.
  preview: boolean;
  now: number;
}

export function useReminderData({ enabled, preview, now }: Options): ReminderData {
  const live = useReminders(enabled && !preview);
  const day = new Date(now).toDateString();
  const previewItems = useMemo(
    () => (preview ? buildPreviewReminders(now) : []),
    // The fixture is anchored to the day, not the minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, day],
  );
  if (preview) return { lists: PREVIEW_LISTS, items: previewItems, loaded: true, unavailable: false };
  return live;
}

export interface CheckOff {
  /** Ids shown checked while their row waits to leave. */
  leaving: ReadonlySet<string>;
  toggle: (item: ReminderDto) => void;
}

/** Checking an open item shows it done for a beat before the write lands; tapping again in that beat cancels. */
export function useCheckOff(setCompleted: (id: string, completed: boolean) => Promise<void>): CheckOff {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, number>());
  const send = useRef(setCompleted);
  useEffect(() => { send.current = setCompleted; });
  useEffect(() => {
    const live = timers.current;
    // Leaving the screen mid-animation still completes what was checked; only a second tap cancels.
    return () => {
      live.forEach((timer, id) => { window.clearTimeout(timer); void send.current(id, true).catch(() => undefined); });
      live.clear();
    };
  }, []);
  const drop = useCallback((id: string) => {
    setLeaving(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const toggle = useCallback((item: ReminderDto) => {
    if (item.completed) {
      void setCompleted(item.id, false).catch(() => undefined);
      return;
    }
    const pending = timers.current.get(item.id);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      timers.current.delete(item.id);
      drop(item.id);
      return;
    }
    setLeaving(prev => new Set(prev).add(item.id));
    timers.current.set(item.id, window.setTimeout(() => {
      timers.current.delete(item.id);
      void setCompleted(item.id, true).catch(() => undefined).finally(() => drop(item.id));
    }, COMPLETE_DELAY_MS));
  }, [setCompleted, drop]);
  return { leaving, toggle };
}
