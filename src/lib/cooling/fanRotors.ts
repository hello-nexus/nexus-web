import type { FanChannel } from '../../api/cooling';
import { NONE_CHANNEL, type CaseFanSlot, type FanBinding } from './caseLayout';
import { simRpm } from './fanSpeed';
import { slotFanKeys } from './slotFlow';

/**
 * The fans that get a spinning rotor, with the rpm to spin at: a slot a real fan channel drives, or a simulated speed (the derived default included).
 * A fan bound to none, and an empty mount, get none. The renderer draws a simulated fan's blades dotted.
 */
export function fanRotorSpeeds(
  slots: readonly Pick<CaseFanSlot, 'key' | 'taken'>[],
  effective: readonly FanBinding[],
  channels: readonly Pick<FanChannel, 'id' | 'rpm'>[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const slot of slots) {
    for (const key of slotFanKeys(slot)) {
      let best: number | null = null;
      for (const b of effective) {
        if (!b.slotKeys.includes(key) || b.channelId === NONE_CHANNEL) continue;
        const channel = channels.find(c => c.id === b.channelId);
        const sim = simRpm(b.channelId);
        const rpm = channel ? channel.rpm : sim;
        if (rpm === null || rpm === undefined) continue;
        if (best === null || rpm > best) best = rpm;
      }
      if (best !== null) out.set(key, best);
    }
  }
  return out;
}
