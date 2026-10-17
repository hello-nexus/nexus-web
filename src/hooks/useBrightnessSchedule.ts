import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBrightnessSchedule, setBrightnessSchedule,
  type BrightnessSchedule, type BrightnessScheduleLocation, type BrightnessSchedulePoint,
  type BrightnessScheduleSun,
} from '../api/lighting';
import { localDateKey, minuteOfDay, scheduledBrightness, sunCurve } from '../lib/brightnessSchedule';
import { useTopicCallback } from './useMultiplexSocket';

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

  const refresh = useCallback(() => {
    fetchBrightnessSchedule().then(data => {
      if (!data) return;
      // A hand-edited settings.json can hold an explicit null here.
      setSchedule({ enabled: data.enabled, points: data.points ?? [] });
      setDefaults(data.defaults ?? []);
      setSunShift(data.sunShift !== false);
      setLocation(data.location ?? null);
      setSun(data.sun ?? null);
    }).catch(() => { /* best-effort */ });
  }, []);

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

  // The generated curve is for one date; a new day needs a fresh one.
  // Keyed on the minute only, so a service that disagrees about the date costs
  // one fetch a minute rather than a loop.
  const sunDateRef = useRef<string | null>(null);
  sunDateRef.current = sun?.date ?? null;
  useEffect(() => {
    if (enabled && sunDateRef.current !== null && sunDateRef.current !== localDateKey()) refresh();
  }, [enabled, minute, refresh]);

  const save = useCallback(async (next: BrightnessSchedule) => {
    setSchedule(next);
    await setBrightnessSchedule(next);
  }, []);

  // The service takes the schedule with every write, so a sun change sends the
  // current one along; the sun fields it leaves out stay as stored.
  const saveSun = useCallback(async (patch: { sunShift?: boolean; location?: BrightnessScheduleLocation | null }) => {
    if (!schedule) return;
    if (patch.sunShift !== undefined) setSunShift(patch.sunShift);
    if (patch.location !== undefined) setLocation(patch.location);
    await setBrightnessSchedule({ enabled: schedule.enabled, points: schedule.points, ...patch });
  }, [schedule]);

  const sunPoints = useMemo(() => sunCurve(sunShift, sun), [sunShift, sun]);
  const current = schedule?.enabled ? Math.round(scheduledBrightness(sunPoints ?? schedule.points, minute)) : null;
  return { schedule, defaults, current, minute, sunShift, location, sun, sunPoints, saveSun, save };
}
