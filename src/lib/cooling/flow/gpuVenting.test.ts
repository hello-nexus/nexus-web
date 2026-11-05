// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/y70-lab-cooling-state.json';
import { collapseMounts, normalizeBindings, parseCaseLayout, type CaseFanSlot } from '../caseLayout';
import { boundSlotKeys, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { defaultDir, fronts, gpuBox, inputFor, rear, slotSpec, tops } from './flowFixtures';
import { buildFlowScene, type FlowInput } from './gridScene';

const GPU_C = 60;
const ROOM_C = 22;

/**
 * Warm air the card's fans pull in: the mean rise over the fan-side layer one cell upstream of its first fan, as a share of the card's own rise.
 * The card's heat must leave through its edges and the case's flow, not come back round into its intake.
 */
function intakeWarmShare(input: FlowInput, steps: number): number {
  const scene = buildFlowScene(input, 64 * 48 * 96);
  const [NX, NY] = scene.dims;
  const flow = new CpuFlow(scene);
  flow.setTemps({ cpu: null, gpu: GPU_C });
  for (let s = 0; s < steps; s++) flow.step();
  const slot = input.layout.fanSlots.find((s: CaseFanSlot) => s.key === 'gpu:fan:0')!;
  const axis = slot.axis!;
  const k = axis.findIndex(v => Math.abs(v) > 0.5);
  const cell = (mm: number, a: number) => Math.floor((mm + scene.origin[a]) / scene.cellMm);
  const lo = [0, 1, 2].map(a => cell(slot.box!.min[a] + 0.01, a));
  const hi = [0, 1, 2].map(a => cell(slot.box!.min[a] + slot.box!.size[a] - 0.01, a));
  const upstream = (axis[k] > 0 ? lo[k] : hi[k]) - Math.sign(axis[k]);
  const lat = [0, 1, 2].filter(a => a !== k);
  let sum = 0, n = 0;
  for (let p = lo[lat[0]]; p <= hi[lat[0]]; p++) for (let q = lo[lat[1]]; q <= hi[lat[1]]; q++) {
    const ijk = [0, 0, 0];
    ijk[k] = upstream; ijk[lat[0]] = p; ijk[lat[1]] = q;
    const c = ijk[0] + NX * (ijk[1] + NY * ijk[2]);
    if (scene.solid[c]) continue;
    sum += flow.t[c]; n++;
  }
  expect(n).toBeGreaterThan(0);
  return sum / n / (GPU_C - ROOM_C);
}

describe('a card whose fans pull air in from the fan side', () => {
  it('does not take its own heated air back in: vertical mount on the lab Y70, fans at full speed', () => {
    const channels = (fixture.channels as { id: string; rpm: number; maxRpm: number | null }[]).map(c => (c.id.startsWith('/gpu-nvidia') ? { ...c, rpm: c.maxRpm ?? c.rpm } : c)) as never[];
    const stored = fixture.layout.bindings as never[];
    const collapsed = collapseMounts(parseCaseLayout(fixture.caseLayout, fixture.radiatorMount)!, [...new Set(boundSlotKeys(stored, channels))].sort());
    const layout = collapsed.layout;
    const bindings = withDefaultBindings(normalizeBindings(stored, collapsed.canonOf), layout.fanSlots, channels);
    const directions = slotDirections(layout.fanSlots, fixture.layout.directions as never);
    const flows = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, channels), directions);
    // Card fans are far smaller than the 120 default and move less air.
    expect(flows.fanCfm['gpu:fan:0']).toBeLessThan(40);
    expect(intakeWarmShare({ layout, directions, fanCfm: flows.fanCfm, ventCfm: flows.ventCfm, referenceCfm: flows.referenceCfm }, 400)).toBeLessThan(0.4);
  }, 180000);

  it('does not take its own heated air back in: horizontal mount, fans on the underside', () => {
    const slots = [...fronts, rear, ...tops, slotSpec('gpu:fan:0', 'gpu', 'fan', [150, 120, 130], [91, 40, 91], [0, 1, 0]), slotSpec('gpu:fan:1', 'gpu', 'fan', [250, 120, 130], [91, 40, 91], [0, 1, 0])];
    const input = inputFor(slots, [gpuBox], defaultDir, 40);
    expect(intakeWarmShare(input, 300)).toBeLessThan(0.4);
    // A spinning card keeps its back plate shut, even on a thin card where the fan disc's clearance reaches it.
    const scene = buildFlowScene(input, 64 * 48 * 96);
    const [NX, NY] = scene.dims;
    const cell = (mm: number, a: number) => Math.floor((mm + scene.origin[a]) / scene.cellMm);
    const back = cell(gpuBox.min[1] + gpuBox.size[1] - 0.01, 1);
    let open = 0, total = 0;
    for (let k = cell(gpuBox.min[2] + 0.01, 2); k <= cell(gpuBox.min[2] + gpuBox.size[2] - 0.01, 2); k++) for (let i = cell(gpuBox.min[0] + 0.01, 0); i <= cell(gpuBox.min[0] + gpuBox.size[0] - 0.01, 0); i++) {
      total++;
      if (!scene.solid[i + NX * (back + NY * k)]) open++;
    }
    expect(open / total).toBeLessThan(0.05);
  }, 120000);
});
