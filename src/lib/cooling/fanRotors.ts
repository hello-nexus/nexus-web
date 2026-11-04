import type { FanChannel } from '../../api/cooling';
import { NONE_CHANNEL, SIM_RPM_UNASSIGNED, simChannelId, type CaseFanSlot, type FanBinding } from './caseLayout';
import { simRpm } from './fanSpeed';
import { slotFanKeys } from './slotFlow';

/**
 * The fans that get a spinning rotor, with the rpm to spin at: a slot a real fan channel drives, or one the user bound (a simulated speed included).
 * A fan that only holds the derived default speed, and an empty mount, get none.
 */
export function fanRotorSpeeds(
  slots: readonly Pick<CaseFanSlot, 'key' | 'taken'>[],
  effective: readonly FanBinding[],
  stored: readonly FanBinding[],
  channels: readonly Pick<FanChannel, 'id' | 'rpm'>[],
): Map<string, number> {
  const out = new Map<string, number>();
  const derived = simChannelId(SIM_RPM_UNASSIGNED);
  const named = new Set(stored.filter(b => b.channelId !== NONE_CHANNEL).flatMap(b => b.slotKeys));
  for (const slot of slots) {
    for (const key of slotFanKeys(slot)) {
      let best: number | null = null;
      for (const b of effective) {
        if (!b.slotKeys.includes(key) || b.channelId === NONE_CHANNEL) continue;
        const channel = channels.find(c => c.id === b.channelId);
        const sim = simRpm(b.channelId);
        // The derived default is a stand-in, not an assignment.
        if (!channel && !named.has(key) && b.channelId === derived) continue;
        const rpm = channel ? channel.rpm : sim;
        if (rpm === null || rpm === undefined) continue;
        if (best === null || rpm > best) best = rpm;
      }
      if (best !== null) out.set(key, best);
    }
  }
  return out;
}
