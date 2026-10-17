import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBrightnessSchedule, setBrightnessSchedule,
  type BrightnessSchedule, type BrightnessScheduleLocation, type BrightnessSchedulePoint,
  type BrightnessScheduleResponse, type BrightnessScheduleSun,
} from '../api/lighting';
import { localDateKey, minuteOfDay, scheduledBrightness, sunCurve } from '../lib/brightnessSchedule';
import { useTopicCallback } from './useMultiplexSocket';

// Longest a write may stay unanswered before refetches stop waiting for it.
const WRITE_TIMEOUT_MS = 10_000;

export interface BrightnessScheduleState {
  /** Null until the first fetch resolves. */
  schedule: BrightnessSchedule | null;
  /** The service's out-of-box curve, for the editor's reset. */
  defaults: BrightnessSchedulePoint[];
  /** The schedule's level right now (0..100), or null while off or unloaded.
   *  Re-evaluated each minute, in step with the service. */
  current: number | null;
  /** Minute of the local day the readout was evaluated at; the editor's
   *  "now" marker. Ticks with `current`. */
  minute: number;
  /** Move the ramps with today's sunrise and sunset. */
  sunShift: boolean;
  /** Where the sun times are for; null is Auto (the service's IP lookup). */
  location: BrightnessScheduleLocation | null;
  /** Today's sun times as the service resolved them. */
  sun: BrightnessScheduleSun | null;
  /** Today's generated curve, which replaces the user's points while the
   *  shift is on; null when the user's curve plays (shift off or no sun). */
  sunPoints: BrightnessSchedulePoint[] | null;
  /** Change the sunset shift or its location; the schedule itself is kept. */
  saveSun: (patch: { sunShift?: boolean; location?: BrightnessScheduleLocation | null }) => Promise<void>;
  /** Persist a new schedule. Optimistic: the state updates before the POST
   *  answers, and the `lighting` topic push re-syncs it either way. */
  save: (next: BrightnessSchedule) => Promise<void>;
}

/**
 * The master-brightness schedule, kept in sync with the `lighting` topic that
 * every /lighting/* mutation publishes, plus a minute tick so `current`
 * follows the clock between pushes.
 */
export function useBrightnessSchedule(enabled: boolean): BrightnessScheduleState {
  const [schedule, setSchedule] = useState<BrightnessSchedule | null>(null);
  const [defaults, setDefaults] = useState<BrightnessSchedulePoint[]>([]);
  const [sunShift, setSunShift] = useState(true);
  const [location, setLocation] = useState<BrightnessScheduleLocation | null>(null);
  const [sun, setSun] = useState<BrightnessScheduleSun | null>(null);
  const [minute, setMinute] = useState(() => minuteOfDay());

  // A GET that began before a local write, or that lands while one is still
  // in flight, may carry the old state; it is dropped, and the write's own
  // answer (or a refetch after it) supplies the truth. A write that never
  // answers is given up on after WRITE_TIMEOUT_MS so it cannot block refetches.
  const writeSeqRef = useRef(0);
  const pendingWritesRef = useRef(0);

  const apply = useCallback((data: BrightnessScheduleResponse) => {
    // A hand-edited settings.json can hold an explicit null here.
    setSchedule({ enabled: data.enabled, points: data.points ?? [] });
    setDefaults(data.defaults ?? []);
    setSunShift(data.sunShift !== false);
    setLocation(data.location ?? null);
    setSun(data.sun ?? null);
  }, []);

  const refresh = useCallback(() => {
    const seq = writeSeqRef.current;
    fetchBrightnessSchedule().then(data => {
      if (!data || pendingWritesRef.current > 0 || seq !== writeSeqRef.current) return;
      apply(data);
    }).catch(() => { /* best-effort */ });
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  // Wake on the minute boundary, then every minute, so the readout and the
  // editor's now-marker move at the same instant the service's level does.
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const arm = () => {
      const now = new Date();
      const untilNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timer = window.setTimeout(() => {
        setMinute(minuteOfDay());
        arm();
      }, untilNextMinute);
    };
    setMinute(minuteOfDay());
    arm();
    return () => window.clearTimeout(timer);
  }, [enabled]);

  // The generated curve is for one date, so a new day needs a fresh one; an
  // Auto location the service could not place yet is retried too. Keyed on the
  // minute only, so a service that keeps disagreeing costs one fetch a minute
  // rather than a loop.
  const staleRef = useRef(false);
  staleRef.current = (sun !== null && sun.date !== localDateKey())
    || (schedule?.enabled === true && sunShift && location === null && sun?.status === 'no-location');
  useEffect(() => {
    if (enabled && staleRef.current) refresh();
  }, [enabled, minute, refresh]);

  // Optimistic write: the answer carries the full state and is adopted; a bare
  // envelope (an older service, or a refusal) is followed by a refetch.
  const write = useCallback(async (optimistic: () => void, body: Parameters<typeof setBrightnessSchedule>[0]) => {
    optimistic();
    const mine = ++writeSeqRef.current;
    pendingWritesRef.current += 1;
    let answer: Awaited<ReturnType<typeof setBrightnessSchedule>> = null;
    let timer = 0;
    try {
      const giveUp = new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), WRITE_TIMEOUT_MS); });
      answer = await Promise.race([setBrightnessSchedule(body), giveUp]);
    } catch {
      // The refetch below restores whatever the service holds.
    } finally {
      window.clearTimeout(timer);
      pendingWritesRef.current -= 1;
    }
    // Only the newest write's answer is current; an older one is replaced by
    // a fresh read.
    if (mine === writeSeqRef.current && answer && 'sun' in answer) apply(answer);
    else refresh();
  }, [apply, refresh]);

  const save = useCallback((next: BrightnessSchedule) => write(() => setSchedule(next), next), [write]);

  // The service takes the schedule with every write, so a sun change sends the
  // current one along; the sun fields it leaves out stay as stored.
  const saveSun = useCallback(async (patch: { sunShift?: boolean; location?: BrightnessScheduleLocation | null }) => {
    if (!schedule) return;
    await write(() => {
      if (patch.sunShift !== undefined) setSunShift(patch.sunShift);
      if (patch.location !== undefined) setLocation(patch.location);
    }, { enabled: schedule.enabled, points: schedule.points, ...patch });
  }, [schedule, write]);

  const sunPoints = useMemo(() => sunCurve(sunShift, sun), [sunShift, sun]);
  const current = schedule?.enabled ? Math.round(scheduledBrightness(sunPoints ?? schedule.points, minute)) : null;
  return { schedule, defaults, current, minute, sunShift, location, sun, sunPoints, saveSun, save };
}
