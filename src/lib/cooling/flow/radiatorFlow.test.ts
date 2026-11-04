// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/t1-cooling-state.json';
import { collapseMounts, parseCaseLayout } from '../caseLayout';
import { M3S_PER_CFM } from '../pressureModel';
import { CpuFlow } from './cpuSolver';
import { OPENING_EXHAUST, buildFlowScene } from './gridScene';

// T1's Y70 with a top radiator whose three fans exhaust: the flows are the live ones the Cooling page solved.
const FAN_CFM: Record<string, number> = { 'right:120:0': 38.8, 'right:120:1': 59.4, 'right:120:2': 18, 'bottom:120:0': 32.4, 'bottom:120:1': 18, 'bottom:120:2': 18, 'gpu:fan:0': 30, 'gpu:fan:1': 30, 'rad:0': 24.4, 'rad:1': 48.2, 'rad:2': 48.2 };
const DIRECTIONS = { 'top:120:0': 'exhaust', 'top:120:1': 'exhaust', 'top:120:2': 'exhaust', 'right:120:0': 'intake', 'right:120:1': 'intake', 'right:120:2': 'intake', 'bottom:120:0': 'intake', 'bottom:120:1': 'intake', 'bottom:120:2': 'intake', 'rear:120:0': 'exhaust', 'gpu:fan:0': 'intake', 'gpu:fan:1': 'intake', 'rad:0': 'exhaust', 'rad:1': 'exhaust', 'rad:2': 'exhaust' } as const;
const GRID = 147456;

describe('a top radiator on a closed-shell case', () => {
  const layout = collapseMounts(parseCaseLayout(fixture.caseLayout)!, []).layout;
  const scene = buildFlowScene({ layout, directions: DIRECTIONS, fanCfm: FAN_CFM, ventCfm: 41.6, referenceCfm: 81.3 }, GRID);
  const [NX, NY] = scene.dims;
  const radFlow = (24.4 + 48.2 + 48.2);

  it('opens the case top over the radiator and gives that side a margin', () => {
    let opened = 0;
    for (let c = 0; c < scene.opening.length; c++) if (scene.opening[c] === OPENING_EXHAUST && Math.floor(c / NX) % NY === scene.caseMax[1]) opened++;
    expect(opened).toBeGreaterThan(20);
    expect(NY - 1).toBeGreaterThan(scene.caseMax[1]);
  });

  it('passes the radiator fans\' air through the core and out of the top', () => {
    const flow = new CpuFlow(scene);
    for (let s = 0; s < 150; s++) flow.step();
    const cellM = scene.cellMm / 1000;
    const top = scene.caseMax[1];
    let flux = 0;
    for (let c = 0; c < scene.opening.length; c++) {
      if (scene.opening[c] !== OPENING_EXHAUST || Math.floor(c / NX) % NY !== top) continue;
      flux += flow.u[c * 3 + 1];
    }
    const cfm = (flux * cellM / scene.stepSeconds * cellM ** 2) / M3S_PER_CFM;
    // The fans' own air, plus what the case's other fans push out through the same opening.
    expect(cfm).toBeGreaterThan(radFlow * 0.8);
    expect(cfm).toBeLessThan((radFlow + 41.6) * 1.35);
  }, 120000);
});
