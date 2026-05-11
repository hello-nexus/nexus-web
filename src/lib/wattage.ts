import type { Build, ComponentCategory, WattageEstimate } from '../types/builder';

const SYSTEM_OVERHEAD = 50;
const RAM_WATTS_PER_MODULE = 5;
const STORAGE_WATTS_PER_DRIVE = 5;
const HEADROOM_MULTIPLIER = 1.25;
const PSU_STEP = 50;

/**
 * Estimate total system wattage from the build's selected components.
 * Returns component breakdown, total, recommended PSU, and headroom vs selected PSU.
 */
export function estimateWattage(build: Build): WattageEstimate {
  const components: Partial<Record<ComponentCategory, number>> = {};

  // CPU TDP
  const cpuEntry = build.slots.cpu?.[0]?.selection;
  if (cpuEntry?.specs.tdp) {
    components.cpu = cpuEntry.specs.tdp;
  }

  // GPU TDP
  const gpuEntry = build.slots.gpu?.[0]?.selection;
  if (gpuEntry?.specs.tdp) {
    components.gpu = gpuEntry.specs.tdp;
  }

  // RAM: 5W per module per slot
  const ramEntries = build.slots.ram ?? [];
  let ramWatts = 0;
  for (const entry of ramEntries) {
    if (entry.selection) {
      const modules = entry.selection.specs.modules ?? 1;
      ramWatts += modules * RAM_WATTS_PER_MODULE;
    }
  }
  if (ramWatts > 0) components.ram = ramWatts;

  // Storage: 5W per drive
  const storageEntries = build.slots.storage ?? [];
  let storageWatts = 0;
  for (const entry of storageEntries) {
    if (entry.selection) storageWatts += STORAGE_WATTS_PER_DRIVE;
  }
  if (storageWatts > 0) components.storage = storageWatts;

  const partsTotal = Object.values(components).reduce((s, w) => s + w, 0);
  const total = partsTotal + SYSTEM_OVERHEAD;
  const recommendedPsu = Math.ceil(total * HEADROOM_MULTIPLIER / PSU_STEP) * PSU_STEP;

  // Headroom: difference between PSU wattage and estimated total (null if no PSU selected)
  const psuEntry = build.slots.psu?.[0]?.selection;
  const psuWattage = psuEntry?.specs.wattage ?? null;
  const headroom = psuWattage != null ? psuWattage - total : null;

  return { components, total, recommendedPsu, headroom };
}
