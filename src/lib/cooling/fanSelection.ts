import { NONE_CHANNEL, simChannelId, type FanBinding } from './caseLayout';
import { simRpm } from './fanSpeed';

/** Keys held while a fan is pressed: Ctrl or Cmd toggles it in or out of the selection, Shift adds it. */
export interface PickModifiers {
  toggle: boolean;
  add: boolean;
}

/**
 * The selection after a press: a plain press selects only that fan, Ctrl or Cmd toggles it, Shift adds it, and a press on nothing clears.
 * The radiator block is picked alone and never joins a selection.
 */
export function nextSelection(current: readonly string[], key: string | null, mods: PickModifiers, alone: (key: string) => boolean = () => false): string[] {
  if (key === null) return [];
  if (alone(key) || (!mods.toggle && !mods.add)) return [key];
  const rest = current.filter(k => !alone(k));
  if (mods.toggle) return rest.includes(key) ? rest.filter(k => k !== key) : [...rest, key];
  return rest.includes(key) ? [...rest] : [...rest, key];
}

/** What a control shows for several targets: their common value, or that they disagree. */
export function sharedOf<T>(values: readonly T[]): { mixed: boolean; value: T | undefined } {
  if (values.length === 0) return { mixed: false, value: undefined };
  const first = values[0];
  return values.every(v => v === first) ? { mixed: false, value: first } : { mixed: true, value: undefined };
}

/** The bindings after pointing every key at `channelId`, one key after another, so a single edit carries all of them. */
export function linkChannelToSlots(
  bindings: readonly FanBinding[],
  channelId: string,
  keys: readonly string[],
  link: (bindings: readonly FanBinding[], channelId: string, key: string) => FanBinding[],
): FanBinding[] {
  return keys.reduce<FanBinding[]>((acc, key) => link(acc, channelId, key), [...bindings]);
}

/** The simulated speeds of the keys when every one of them is simulated; null when any is not. */
export function simSpeeds(channelOf: (key: string) => string | null, keys: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const key of keys) {
    const rpm = simRpm(channelOf(key) ?? '');
    if (rpm === null) return null;
    out.push(rpm);
  }
  return out;
}

/** The device a key's fan is linked to, or the none marker. */
export const ownerOf = (channelOf: (key: string) => string | null, key: string): string => channelOf(key) ?? NONE_CHANNEL;

export { simChannelId };
