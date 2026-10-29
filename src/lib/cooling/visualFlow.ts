import type { CaseFanSlot } from './caseLayout';
import { scaledSpec, type SlotSpeed } from './fanSpeed';
import { slotModelFans, type CatalogFanSpec } from './fanSpecs';
import { solveCasePressure, type FanDirection } from './pressureModel';
import { isGpuSlotKey, pressureFans } from './slotFlow';

/** Share of its rated flow a spinning fan is drawn with at least, so the slowest still reads as clearly moving; above it the flow is the physical operating point. */
export const MIN_DRAWN_FLOW_SHARE = 0.3;

export interface VisualFlow {
  fanCfm: Record<string, number>;
  /** Air leaving (positive) or entering (negative) through the unfanned openings, CFM. */
  ventCfm: number;
  /** The largest rated flow among the fans: the time scale for the solver. */
  referenceCfm: number;
}

/**
 * The flow the particle view shows: each case fan at its operating point, where its curve (fan laws on its live speed) meets the case's impedance, so the figures match the stats strip and the vents carry the imbalance.
 * A GPU fan blows into the card and recirculates, so it runs on its own curve at free air.
 */
export function visualFlow(slots: readonly CaseFanSlot[], catalog: readonly CatalogFanSpec[], speeds: ReadonlyMap<string, SlotSpeed>, directions: Readonly<Record<string, FanDirection>>): VisualFlow {
  const fanCfm: Record<string, number> = {};
  let referenceCfm = 0;
  const { fans } = pressureFans(slots, catalog, speeds, directions);
  const solved = solveCasePressure(fans);
  const operating = new Map(solved.fans.map(f => [f.key, f.cfm]));
  for (const slot of slots) {
    for (const fan of slotModelFans(slot, catalog)) {
      referenceCfm = Math.max(referenceCfm, fan.cfm);
      const fraction = speeds.get(fan.key)?.fraction ?? 1;
      const cfm = isGpuSlotKey(slot.key) ? scaledSpec(fan, fraction).cfm : operating.get(fan.key) ?? 0;
      fanCfm[fan.key] = fraction > 0 ? Math.max(cfm, MIN_DRAWN_FLOW_SHARE * fan.cfm) : 0;
    }
  }
  return { fanCfm, ventCfm: solved.ventCfm, referenceCfm };
}
