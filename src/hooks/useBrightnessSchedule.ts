import { useCallback, useEffect, useState } from 'react';
import {
  fetchBrightnessSchedule, setBrightnessSchedule,
  type BrightnessSchedule, type BrightnessSchedulePoint,
} from '../api/lighting';
import { minuteOfDay, scheduledBrightness } from '../lib/brightnessSchedule';
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
  const [minute, setMinute] = useState(() => minuteOfDay());

  const refresh = useCallback(() => {
    fetchBrightnessSchedule().then(data => {
      if (!data) return;
      // A hand-edited settings.json can hold an explicit null here.
      setSchedule({ enabled: data.enabled, points: data.points ?? [] });
      setDefaults(data.defaults ?? []);
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
      timer = window.setTimeout(() => { setMinute(minuteOfDay()); arm(); }, untilNextMinute);
    };
    setMinute(minuteOfDay());
    arm();
    return () => window.clearTimeout(timer);
  }, [enabled]);

  const save = useCallback(async (next: BrightnessSchedule) => {
    setSchedule(next);
    await setBrightnessSchedule(next);
  }, []);

  const current = schedule?.enabled ? Math.round(scheduledBrightness(schedule.points, minute)) : null;
  return { schedule, defaults, current, minute, save };
}
