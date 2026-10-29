import type { CaseBox, CaseLayout, Vec3 } from '../caseLayout';
import { AIR_DENSITY, AIR_SPECIFIC_HEAT, BUOYANCY_MIN_POWER_W, BUOYANCY_MIN_RISE_K, HEAT_COUPLING, ROOM_TEMP_C } from './flowParams';
import { M3S_PER_CFM } from '../pressureModel';
import { SOURCE_CPU, SOURCE_GPU } from './gridScene';

/** Live temperatures of the parts that heat the air, C; null when the sensor is missing. */
export interface ComponentTemps {
  cpu: number | null;
  gpu: number | null;
  /** Live package power, W, from the part's power sensor; absent or null when there is none, and the heat then follows the part's temperature. */
  cpuW?: number | null;
  gpuW?: number | null;
}

export const NO_TEMPS: ComponentTemps = { cpu: null, gpu: null };

/** What a part's cells pull the air toward, as degrees above room temperature, by `SOURCE_*`; negative means that part heats nothing. */
export function sourceRises(temps: ComponentTemps): [number, number, number] {
  const rise = (t: number | null) => (t === null || !Number.isFinite(t) ? -1 : Math.max(0, t - ROOM_TEMP_C));
  const out: [number, number, number] = [-1, -1, -1];
  out[SOURCE_GPU] = rise(temps.gpu);
  out[SOURCE_CPU] = rise(temps.cpu);
  return out;
}

/** Watts each part adds to the air, by `SOURCE_*`; negative when the part has no power reading. */
export function sourceWatts(temps: ComponentTemps): [number, number, number] {
  const w = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : -1);
  const out: [number, number, number] = [-1, -1, -1];
  out[SOURCE_GPU] = w(temps.gpuW);
  out[SOURCE_CPU] = w(temps.cpuW);
  return out;
}

/** Degrees the air leaving the case is above room temperature: all the power over rho cp times the flow, the energy balance of the whole case. Zero for no flow. */
export function exhaustRiseK(totalWatts: number, flowCfm: number): number {
  const flow = flowCfm * M3S_PER_CFM;
  return flow > 0 ? totalWatts / (AIR_DENSITY * AIR_SPECIFIC_HEAT * flow) : 0;
}

/** One step of the air in a heat cell: it closes a share of its gap to the part's temperature, so it never passes it. `speed` scales the step (1 for one solver step). */
export const heatStep = (rise: number, sourceRise: number, speed: number): number =>
  sourceRise < 0 ? rise : rise + Math.min(1, HEAT_COUPLING * speed) * (sourceRise - rise);

/** Whether any part is warm enough to drive a plume on its own. */
export const isHot = (rises: readonly number[], watts: readonly number[] = []): boolean =>
  rises.some((r, i) => (r >= 0 ? r >= BUOYANCY_MIN_RISE_K : (watts[i] ?? -1) >= BUOYANCY_MIN_POWER_W));

export interface HeatAnchor {
  key: 'cpu' | 'gpu';
  /** Layout mm. */
  at: Vec3;
}

const center = (b: { min: Vec3; size: Vec3 }): Vec3 => [b.min[0] + b.size[0] / 2, b.min[1] + b.size[1] / 2, b.min[2] + b.size[2] / 2];
const firstOf = (boxes: readonly CaseBox[], slot: string) => boxes.find(b => b.slot === slot && b.role === 'part');

/** Where each component's temperature label sits: the GPU card, and the CPU at its cooler, else its own box, else the radiator. */
export function heatAnchors(layout: CaseLayout): HeatAnchor[] {
  const out: HeatAnchor[] = [];
  const gpu = firstOf(layout.boxes, 'gpu');
  if (gpu) out.push({ key: 'gpu', at: center(gpu) });
  const cpuBox = firstOf(layout.boxes, 'cooler') ?? firstOf(layout.boxes, 'cpu') ?? layout.fanSlots.find(s => s.taken === 'radiator' && s.box)?.box;
  if (cpuBox) out.push({ key: 'cpu', at: center(cpuBox) });
  return out;
}
