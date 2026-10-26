// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NONE_CHANNEL, parseCaseLayout, type CaseLayout, type FanBinding } from '../caseLayout';
import { lumpedModel, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { buildFlowScene } from './gridScene';

const FILES = ['y70', 'y50', 'y60', 'x50', 'lancool216'];
const LOW = 32 * 24 * 48;

describe.each(FILES)('%s idle fans', file => {
  const raw = JSON.parse(readFileSync(new URL(`../__fixtures__/${file}-case-layout.json`, import.meta.url), 'utf8')) as { fanSlots: { key: string; taken?: string | null }[] };
  const layout = parseCaseLayout({ ...raw, fanSlots: raw.fanSlots.map(s => (s.taken === 'radiator' ? s : { ...s, taken: 'fan' })) }) as CaseLayout;
  const keys = layout.fanSlots.filter(s => s.taken === 'fan').map(s => s.key);
  // The view's own derivation: stored bindings plus the default for each installed fan nothing names.
  const derive = (stored: FanBinding[]) => {
    const bindings = withDefaultBindings(stored, layout.fanSlots, []);
    const speeds = slotSpeeds(layout.fanSlots, bindings, []);
    const directions = slotDirections(layout.fanSlots, {});
    const lumped = lumpedModel(layout.fanSlots, [], speeds, directions);
    const visual = visualFlow(layout.fanSlots, [], speeds, directions);
    const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, LOW);
    return { lumped, visual, scene };
  };

  it('runs an unassigned installed fan at the simulated default', () => {
    const { lumped, visual, scene } = derive([]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(visual.fanCfm[k], k).toBeGreaterThan(0);
    expect(scene.fanCount).toBe(keys.length);
    expect(lumped.result.fans.length).toBeGreaterThan(0);
    expect(lumped.result.intakeCfm + lumped.result.exhaustCfm).toBeGreaterThan(0);
  });

  it('gives an explicit none slot no fan, no emitters, no forcing and no strip flow', () => {
    const { lumped, visual, scene } = derive([{ channelId: NONE_CHANNEL, slotKeys: keys }]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(visual.fanCfm[k], k).toBe(0);
    expect(visual.ventCfm).toBe(0);
    expect(scene.fanCount).toBe(0);
    expect(scene.emitters.length).toBe(0);
    expect(scene.fanCell.some(v => v === 1)).toBe(false);
    expect(scene.target.some(v => v !== 0)).toBe(false);
    expect(lumped.result.fans).toEqual([]);
    expect(lumped.result.intakeCfm).toBe(0);
    expect(lumped.result.exhaustCfm).toBe(0);
    expect(lumped.result.pressurePa).toBeCloseTo(0, 9);
  });

  it('starts and stops a fan on the same grid when it is linked and unlinked', () => {
    const idle = derive([{ channelId: NONE_CHANNEL, slotKeys: keys }]);
    const one = derive([{ channelId: NONE_CHANNEL, slotKeys: keys.slice(1) }, { channelId: 'sim:1500', slotKeys: [keys[0]] }]);
    const back = derive([{ channelId: NONE_CHANNEL, slotKeys: keys }]);
    expect(one.visual.fanCfm[keys[0]]).toBeGreaterThan(0);
    expect(one.scene.emitters.length).toBeGreaterThan(0);
    expect(one.scene.dims).toEqual(idle.scene.dims);
    expect(one.scene.origin).toEqual(idle.scene.origin);
    expect(back.scene.dims).toEqual(idle.scene.dims);
    expect(back.scene.emitters.length).toBe(0);
  });
});
