import type { CaseFanSlot } from './caseLayout';
import { visualFlowCfm, type SlotSpeed } from './fanSpeed';
import { slotModelFans, type CatalogFanSpec } from './fanSpecs';
import type { FanDirection } from './pressureModel';
import { isGpuSlotKey } from './slotFlow';

export interface VisualFlow {
  fanCfm: Record<string, number>;
  /** Air leaving (positive) or entering (negative) through the unfanned openings, CFM. */
  ventCfm: number;
  /** The largest rated flow among the fans: the time scale for the solver. */
  referenceCfm: number;
}

/** The flow the particle view shows: each fan's rated flow compressed by speed, so no spinning fan is stalled by case pressure; the vents carry the imbalance. */
export function visualFlow(slots: readonly CaseFanSlot[], catalog: readonly CatalogFanSpec[], speeds: ReadonlyMap<string, SlotSpeed>, directions: Readonly<Record<string, FanDirection>>): VisualFlow {
  const fanCfm: Record<string, number> = {};
  let net = 0;
  let referenceCfm = 0;
  for (const slot of slots) {
    const fraction = speeds.get(slot.key)?.fraction ?? 1;
    for (const fan of slotModelFans(slot, catalog)) {
      const cfm = visualFlowCfm(fan.cfm, fraction);
      fanCfm[fan.key] = cfm;
      referenceCfm = Math.max(referenceCfm, fan.cfm);
      // A GPU fan's air recirculates inside the case, so it moves particles but not the net.
      if (!isGpuSlotKey(slot.key)) net += directions[slot.key] === 'exhaust' ? -cfm : cfm;
    }
  }
  return { fanCfm, ventCfm: net, referenceCfm };
}
