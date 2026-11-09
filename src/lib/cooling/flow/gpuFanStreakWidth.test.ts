// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/y70-lab-cooling-state.json';
import { collapseMounts, normalizeBindings, parseCaseLayout } from '../caseLayout';
import { boundSlotKeys, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { FLOW_LOOK, solverSpeedRef } from './flowLook';
import { VISUAL_TIME_SCALE } from './flowParams';
import { buildFlowScene } from './gridScene';
import { PARTICLE_STEPS_PER_SECOND } from './particleClock';

const TIER = 32 * 24 * 48;

/** The lab Y70 with its card fans at the given rpm and every other fan as in the fixture. */
function labScene(gpuRpm: number) {
  const channels = (fixture.channels as { id: string; rpm: number }[]).map(c => (c.id.startsWith('/gpu-nvidia') ? { ...c, rpm: gpuRpm } : c)) as never[];
  const stored = fixture.layout.bindings as never[];
  const collapsed = collapseMounts(parseCaseLayout(fixture.caseLayout, fixture.radiatorMount)!, [...new Set(boundSlotKeys(stored, channels))].sort());
  const layout = collapsed.layout;
  const bindings = withDefaultBindings(normalizeBindings(stored, collapsed.canonOf), layout.fanSlots, channels);
  const directions = slotDirections(layout.fanSlots, fixture.layout.directions as never);
  const flows = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, channels), directions);
  const scene = buildFlowScene({ layout, directions, fanCfm: flows.fanCfm, ventCfm: flows.ventCfm, referenceCfm: flows.referenceCfm }, TIER);
  return { layout, flows, scene };
}

/** Streak width factor from speed, as the streak shader computes it: the perceptual gamma on the solved cells per step, then the width ramp on mm per particle step. */
function widthAt(scene: ReturnType<typeof labScene>['scene'], flow: CpuFlow, mm: number[]): number {
  const p = mm.map((x, i) => (x + scene.origin[i]) / scene.cellMm);
  const u = [0, 0, 0];
  flow.sample(p[0], p[1], p[2], u);
  const m = Math.hypot(u[0], u[1], u[2]);
  const ref = solverSpeedRef(FLOW_LOOK, scene);
  const lifted = m > 1e-6 ? m * Math.pow(m / ref, (m < ref ? FLOW_LOOK.speedGamma : FLOW_LOOK.speedGammaHi) - 1) : 0;
  const drawn = (VISUAL_TIME_SCALE / (PARTICLE_STEPS_PER_SECOND * scene.stepSeconds)) * FLOW_LOOK.timeScaleMul;
  const [lo, hi, min] = FLOW_LOOK.speedWidth;
  const t = Math.min(1, Math.max(0, (lifted * drawn * scene.cellMm - lo) / (hi - lo)));
  return min + (1 - min) * t * t * (3 - 2 * t);
}

describe('a card whose fans start spinning', () => {
  const off = labScene(0);
  const on = labScene(1900);

  it('spins up only its own fans', () => {
    expect(off.flows.fanCfm['gpu:fan:0']).toBe(0);
    expect(on.flows.fanCfm['gpu:fan:0']).toBeGreaterThan(0);
    expect(on.flows.fanCfm['top:120:0']).toBe(off.flows.fanCfm['top:120:0']);
  });

  it('keeps the drawn time scale of the case fans', () => {
    expect(on.scene.drawStepSeconds).toBeCloseTo(off.scene.drawStepSeconds, 12);
    expect(on.scene.stepSeconds).toBeLessThanOrEqual(on.scene.drawStepSeconds);
  });

  it('leaves the width of a case fan streak where it was', () => {
    const widths = [off, on].map(({ layout, scene }) => {
      const flow = new CpuFlow(scene);
      for (let s = 0; s < 300; s++) flow.step();
      const slot = layout.fanSlots.find(f => f.key === 'top:120:0')!;
      const c = slot.box!.min.map((m, i) => m + slot.box!.size[i] / 2 + slot.axis![i] * scene.cellMm * 4);
      return widthAt(scene, flow, c);
    });
    expect(Math.abs(widths[1] - widths[0])).toBeLessThan(0.02);
  }, 120000);
});
