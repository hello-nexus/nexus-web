import type { CaseBox, CaseLayout, Vec3 } from '../caseLayout';
import { AMBIENT_C, HEAT_COUPLING } from './flowParams';
import { SOURCE_CPU, SOURCE_GPU } from './gridScene';

/** Live temperatures of the parts that heat the air, C; null when the sensor is missing. */
export interface ComponentTemps {
  cpu: number | null;
  gpu: number | null;
}

export const NO_TEMPS: ComponentTemps = { cpu: null, gpu: null };

/** What a part's cells pull the air toward, as degrees above ambient, by `SOURCE_*`; negative means that part heats nothing. */
export function sourceRises(temps: ComponentTemps): [number, number, number] {
  const rise = (t: number | null) => (t === null || !Number.isFinite(t) ? -1 : Math.max(0, t - AMBIENT_C));
  const out: [number, number, number] = [-1, -1, -1];
  out[SOURCE_GPU] = rise(temps.gpu);
  out[SOURCE_CPU] = rise(temps.cpu);
  return out;
}

/** One step of a particle in a heat cell: the air closes a share of its gap to the part's temperature, so it never passes it. `speed` is the visual time scale. */
export const heatStep = (rise: number, sourceRise: number, speed: number): number =>
  sourceRise < 0 ? rise : rise + Math.min(1, HEAT_COUPLING * speed) * (sourceRise - rise);

export interface HeatAnchor {
  key: 'cpu' | 'gpu';
  /** Layout mm. */
  at: Vec3;
}

const centre = (b: { min: Vec3; size: Vec3 }): Vec3 => [b.min[0] + b.size[0] / 2, b.min[1] + b.size[1] / 2, b.min[2] + b.size[2] / 2];
const firstOf = (boxes: readonly CaseBox[], slot: string) => boxes.find(b => b.slot === slot && b.role === 'part');

/** Where each component's temperature label sits: the GPU card, and the CPU at its cooler, else its own box, else the radiator. */
export function heatAnchors(layout: CaseLayout): HeatAnchor[] {
  const out: HeatAnchor[] = [];
  const gpu = firstOf(layout.boxes, 'gpu');
  if (gpu) out.push({ key: 'gpu', at: centre(gpu) });
  const cpuBox = firstOf(layout.boxes, 'cooler') ?? firstOf(layout.boxes, 'cpu') ?? layout.fanSlots.find(s => s.taken === 'radiator' && s.box)?.box;
  if (cpuBox) out.push({ key: 'cpu', at: centre(cpuBox) });
  return out;
}
