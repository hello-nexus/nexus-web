import { defaultSecondsForMedia, SMART_POLL_NEVER, type SmartPollDrive } from '../../../api/smartPoll';

/** The persisted SMART poll settings, in the shape the service stores. */
export interface SmartPollState {
  seconds: Record<string, number>;
  defaultSeconds: number;
  perDrive: boolean;
}

export interface SmartPollPatch {
  smartPollSeconds: Record<string, number>;
  smartPollDefaultSeconds: number;
  smartPollPerDrive: boolean;
}

/** Select value that follows the "Default for all drives" setting. */
export const SMART_POLL_FOLLOW_DEFAULT = 'default';

/** What the service applies to this drive: the shared default, or its own entry once drives are set separately. */
export function effectiveSeconds(state: SmartPollState, drive: SmartPollDrive): number {
  if (!state.perDrive) return state.defaultSeconds;
  return state.seconds[drive.id] ?? defaultSecondsForMedia(drive.rotational);
}

/** The Select value for a drive: the default sentinel while it runs at the shared default. */
export function driveIntervalValue(state: SmartPollState, drive: SmartPollDrive): string {
  const seconds = effectiveSeconds(state, drive);
  return seconds === state.defaultSeconds ? SMART_POLL_FOLLOW_DEFAULT : String(seconds);
}

/**
 * Setting one drive. The service honours per-drive entries only while
 * smartPollPerDrive is on, and then falls back to a media default for a drive
 * with no entry, so every known drive is written out explicitly and the flag
 * stays on only while some drive differs from the shared default.
 */
export function setDriveInterval(
  state: SmartPollState, drives: SmartPollDrive[], id: string, value: string,
): SmartPollPatch {
  const merged = { ...state.seconds };
  for (const d of drives) merged[d.id] = effectiveSeconds(state, d);
  merged[id] = value === SMART_POLL_FOLLOW_DEFAULT ? state.defaultSeconds : Number(value);
  return {
    smartPollSeconds: merged,
    smartPollDefaultSeconds: state.defaultSeconds,
    smartPollPerDrive: drives.some(d => merged[d.id] !== state.defaultSeconds),
  };
}

/** Changing the shared default moves the drives that were following it and leaves the ones set apart. */
export function setDefaultInterval(
  state: SmartPollState, drives: SmartPollDrive[], next: number,
): SmartPollPatch {
  if (!state.perDrive) {
    return { smartPollSeconds: state.seconds, smartPollDefaultSeconds: next, smartPollPerDrive: false };
  }
  const merged = { ...state.seconds };
  for (const d of drives) {
    if (effectiveSeconds(state, d) === state.defaultSeconds) merged[d.id] = next;
  }
  return {
    smartPollSeconds: merged,
    smartPollDefaultSeconds: next,
    smartPollPerDrive: drives.some(d => (merged[d.id] ?? effectiveSeconds(state, d)) !== next),
  };
}

export function smartPollIntervalLabel(t: (key: string, params?: Record<string, string | number>) => string, seconds: number): string {
  if (seconds === SMART_POLL_NEVER) return t('settings.smartPoll.never');
  if (seconds >= 60) return t('settings.smartPoll.minutes', { count: Math.round(seconds / 60) });
  return t('settings.smartPoll.seconds', { count: seconds });
}

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Pairs Diagnostics drives with the poll list. The two services key a drive
 * differently (serial versus hardware path), so the pairing is by model name,
 * one-to-one in list order for identical models. An unmatched drive gets none.
 */
export function pairPollDrives(
  drives: ReadonlyArray<{ id: string; name: string }>, pollDrives: SmartPollDrive[],
): Map<string, SmartPollDrive> {
  const pool = new Map<string, SmartPollDrive[]>();
  for (const p of pollDrives) {
    const key = normalizeName(p.name);
    pool.set(key, [...(pool.get(key) ?? []), p]);
  }
  const out = new Map<string, SmartPollDrive>();
  for (const d of drives) {
    const match = pool.get(normalizeName(d.name))?.shift();
    if (match) out.set(d.id, match);
  }
  return out;
}
