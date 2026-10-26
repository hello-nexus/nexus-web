import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import type { FlowInput } from './gridScene';

export interface SlotSpec {
  key: string;
  position: string;
  taken: 'fan' | 'radiator' | null;
  min: number[];
  size: number[];
  axis: number[];
}

export const slotSpec = (key: string, position: string, taken: 'fan' | 'radiator' | null, min: number[], size: number[], axis: number[]): SlotSpec => ({ key, position, taken, min, size, axis });

/** A 480 deep, 360 wide, 440 tall case: scene axes x depth, y height, z width. */
export function layoutOf(slots: SlotSpec[], boxes: unknown[] = []): CaseLayout {
  const l = parseCaseLayout({
    size: [480, 360, 440],
    boxes,
    fanSlots: slots.map(s => ({ key: s.key, position: s.position, size: 120, index: 0, taken: s.taken, box: { min: s.min, size: s.size }, axis: s.axis })),
  });
  if (!l) throw new Error('layout');
  return l;
}

export const fronts = [0, 1, 2].map(i => slotSpec(`front:120:${i}`, 'front', 'fan', [0, 60 + i * 120, 120], [25, 120, 120], [1, 0, 0]));
export const rear = slotSpec('rear:120:0', 'rear', 'fan', [455, 250, 120], [25, 120, 120], [-1, 0, 0]);
export const tops = [0, 1, 2].map(i => slotSpec(`top:120:${i}`, 'top', 'fan', [120 + i * 120, 415, 120], [120, 25, 120], [0, -1, 0]));
export const bottoms = [0, 1].map(i => slotSpec(`bottom:120:${i}`, 'bottom', 'fan', [120 + i * 120, 0, 120], [120, 25, 120], [0, 1, 0]));

export const gpuBox = { slot: 'gpu', role: 'part', min: [120, 120, 100], size: [300, 40, 120] };
/** A PSU shroud as a closed solid of planar faces: a box 0..1 scaled, so the drawn shape and the voxels can be compared. */
export function solidBoxFaces(min: number[], size: number[]): number[][][] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = [x0 + size[0], y0 + size[1], z0 + size[2]];
  return [
    [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]],
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]],
  ];
}
/** Sits above the bottom fans' clearance (the 25 mm fan plus FAN_CLEARANCE_MM), so no fan discs open into it. */
export const shroudBox = { slot: 'psu', role: 'structure', min: [20, 60, 40], size: [330, 50, 280], faces: solidBoxFaces([20, 60, 40], [330, 50, 280]), cadSolid: true };

export function inputFor(slots: SlotSpec[], boxes: unknown[], dirOf: (s: SlotSpec) => 'intake' | 'exhaust', cfm = 60, ventCfm = 0): FlowInput {
  const layout = layoutOf(slots, boxes);
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  const fanCfm: Record<string, number> = {};
  for (const s of slots) { directions[s.key] = dirOf(s); if (s.taken === 'fan') fanCfm[s.key] = cfm; }
  return { layout, directions, fanCfm, ventCfm };
}

export const defaultDir = (s: SlotSpec) => (s.position === 'rear' || s.position === 'top' ? 'exhaust' as const : 'intake' as const);
export const nineFans = [...fronts, rear, ...tops, ...bottoms.slice(0, 2)];
export const caseWithGpuAndShroud = () => inputFor(nineFans, [gpuBox, shroudBox], defaultDir);
