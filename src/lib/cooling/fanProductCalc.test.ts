// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PcSetupItem } from '../../api/pcSetup';
import { parseCaseLayout, simChannelId, type CaseLayout } from './caseLayout';
import { buildFlowScene } from './flow/gridScene';
import { catalogFanSpecs } from './fanSpecs';
import { slotDirections, slotSpeeds, withDefaultBindings } from './slotFlow';
import { declutterPills, slotProduct } from './slotProduct';
import { visualFlow } from './visualFlow';

const raw = JSON.parse(readFileSync(new URL('./__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as { fanSlots: { key: string }[] };
const KEY = 'rear:120:0';
const LOW = 32 * 24 * 48;

/** The Y70 with one rear fan installed; `fan` is the product Build attached to it, if any. */
const layoutWith = (fan?: Record<string, unknown>): CaseLayout => parseCaseLayout({
  ...raw,
  fanSlots: raw.fanSlots.map(s => (s.key === KEY ? { ...s, taken: 'fan', ...(fan ? { fan } : {}) } : s)),
}, null) as CaseLayout;

const product = { title: 'Maker Fan 120', rpmMax: 1500, airflowCfm: 60, staticPressureMmH2O: 1.8 };

/** The flow the view computes, with the fan on a simulated channel at `rpm`. */
function flowAt(layout: CaseLayout, rpm: number, catalog: PcSetupItem[] = []) {
  const bindings = withDefaultBindings([{ channelId: simChannelId(rpm), slotKeys: [KEY] }], layout.fanSlots, []);
  const speeds = slotSpeeds(layout.fanSlots, bindings, []);
  const directions = slotDirections(layout.fanSlots, {});
  return { speeds, directions, flow: visualFlow(layout.fanSlots, catalogFanSpecs(catalog), speeds, directions), layout };
}

describe('a slot product drives the airflow calculation', () => {
  it('a higher rated CFM raises the fan flow the solver receives', () => {
    const low = flowAt(layoutWith({ ...product, airflowCfm: 40 }), 1000).flow.fanCfm[KEY];
    const high = flowAt(layoutWith({ ...product, airflowCfm: 80 }), 1000).flow.fanCfm[KEY];
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });

  it('the rated CFM sets the flow, not a borrowed catalog fan of the same size', () => {
    const owned: PcSetupItem = { id: 'f', kind: 'fan', owned: true, catalog: { category: 'fan', partId: 'p', title: 'Owned', specs: { sizeMm: 120, airflowCfm: 200, staticPressureMmH2O: 4 } } };
    const withProduct = flowAt(layoutWith({ ...product, airflowCfm: 40 }), 1000, [owned]).flow.fanCfm[KEY];
    const without = flowAt(layoutWith(), 1000, [owned]).flow.fanCfm[KEY];
    expect(withProduct).toBeLessThan(without);
  });

  it('a lower rated max RPM raises the speed share of the same live speed', () => {
    const slow = flowAt(layoutWith({ ...product, rpmMax: 750 }), 700).speeds.get(KEY)!.fraction;
    const fast = flowAt(layoutWith({ ...product, rpmMax: 1500 }), 700).speeds.get(KEY)!.fraction;
    expect(slow).toBeCloseTo(700 / 750);
    expect(fast).toBeCloseTo(700 / 1500);
    expect(flowAt(layoutWith({ ...product, rpmMax: 750 }), 700).flow.fanCfm[KEY]).toBeGreaterThan(flowAt(layoutWith({ ...product, rpmMax: 1500 }), 700).flow.fanCfm[KEY]);
  });

  it('the solver scene moves air at a speed that follows the product CFM', () => {
    const air = (cfm: number) => {
      const { flow, directions, layout } = flowAt(layoutWith({ ...product, airflowCfm: cfm }), 1000);
      const scene = buildFlowScene({ layout, directions, fanCfm: flow.fanCfm, ventCfm: flow.ventCfm, referenceCfm: flow.referenceCfm }, LOW);
      return { cfm: flow.fanCfm[KEY], metersPerSecond: (scene.maxTargetCells * scene.cellMm / 1000) / scene.stepSeconds };
    };
    const a = air(40);
    const b = air(80);
    expect(b.metersPerSecond).toBeGreaterThan(a.metersPerSecond);
    expect(b.metersPerSecond / a.metersPerSecond).toBeCloseTo(b.cfm / a.cfm, 1);
  });

  it('a stopped fan has no current CFM', () => {
    expect(flowAt(layoutWith(product), 0).flow.fanCfm[KEY]).toBe(0);
  });
});

describe('slotProduct', () => {
  const slotOf = (layout: CaseLayout) => layout.fanSlots.find(s => s.key === KEY)!;

  it('reads the slot\'s own product and leaves unstated ratings undefined', () => {
    const layout = layoutWith({ title: 'Maker Fan 120', airflowCfm: 60 });
    expect(slotProduct(slotOf(layout), layout.fanSlots)).toEqual({ title: 'Maker Fan 120', airflowCfm: 60, rpmMax: undefined, staticMmH2O: undefined });
  });

  it('is null for a slot with no product, even when an owned fan of the same size is in the setup', () => {
    const layout = layoutWith();
    expect(slotProduct(slotOf(layout), layout.fanSlots)).toBeNull();
    const owned: PcSetupItem = { id: 'f', kind: 'fan', owned: true, catalog: { category: 'fan', partId: 'p', title: 'Owned', specs: { sizeMm: 120, airflowCfm: 200 } } };
    expect(catalogFanSpecs([owned])).toHaveLength(1);
    expect(slotProduct(slotOf(layout), layout.fanSlots)).toBeNull();
  });

  it('is null for ratings without a title and for an empty mount', () => {
    const untitled = layoutWith({ airflowCfm: 60 });
    expect(slotProduct(slotOf(untitled), untitled.fanSlots)).toBeNull();
    const empty = layoutWith(product);
    expect(slotProduct({ ...slotOf(empty), taken: null }, empty.fanSlots)).toBeNull();
  });

  it('takes an AIO radiator fan\'s product from the radiator spec on the covered slots', () => {
    const covered = { key: 'top:360:0', position: 'top', size: 120, index: 0, taken: 'radiator' as const, radiator: { title: 'Maker AIO', fanRpmMax: 2000, fanAirflowCfm: 70, fanStaticPressureMmH2O: 2.4, fanCount: 3 } };
    const fan = { key: 'rad:0', position: 'top', size: 120, index: 0, taken: 'fan' as const };
    expect(slotProduct(fan, [covered, fan])).toEqual({ title: 'Maker AIO', rpmMax: 2000, airflowCfm: 70, staticMmH2O: 2.4 });
    expect(slotProduct(fan, [fan])).toBeNull();
  });
});

describe('declutterPills', () => {
  it('leaves separate pills alone and stacks overlapping ones without overlap', () => {
    const far = declutterPills([{ key: 'a', x: 0, y: 0 }, { key: 'b', x: 300, y: 0 }], 72, 22);
    expect(far).toEqual({ a: 0, b: 0 });
    const near = declutterPills([{ key: 'a', x: 100, y: 100 }, { key: 'b', x: 110, y: 102 }, { key: 'c', x: 105, y: 101 }], 72, 22);
    const ys = [100 + near.a, 102 + near.b, 101 + near.c].sort((p, q) => p - q);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(22);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(22);
  });
});
