import { describe, expect, it } from 'vitest';
import { parseCaseLayout } from './caseLayout';
import { psuFanSlots, PSU_SIM_RPM } from './psuFans';
import { drawsCaseAir, lumpedModel, slotDirections, withDefaultBindings } from './slotFlow';
import { simChannelId } from './caseLayout';
import { visualFlow } from './visualFlow';
import { fanRotorSpeeds } from './fanRotors';

const psuBox = (fans: Record<string, unknown> | undefined) => ({ slot: 'psu', role: 'part', min: [349, 411, 18.7], size: [160, 86, 150], ...(fans ? { fans } : {}) });
const withBoxes = (boxes: unknown[]) => parseCaseLayout({ size: [510, 255, 509], boxes, fanSlots: [] })!;
const FACE_DOWN = { axis: 'y', side: 'min', count: 1, diameter: 120, exhaust: { axis: 'x', side: 'max' } };

describe('psuFanSlots', () => {
  it('seats the fan on the PSU face it draws through, pointing into the PSU', () => {
    const [slot] = withBoxes([psuBox(FACE_DOWN)]).fanSlots;
    expect(slot).toMatchObject({ key: 'psu:fan:0', position: 'psu', taken: 'fan', axis: [0, 1, 0], size: 126 });
    expect(slot.box!.min[1] + slot.box!.size[1] / 2).toBeCloseTo(411);
    expect(slot.box!.min[0] + slot.box!.size[0] / 2).toBeCloseTo(349 + 80);
    expect(slot.box!.min[2] + slot.box!.size[2] / 2).toBeCloseTo(18.7 + 75);
  });

  it('points a max-side fan the other way', () => {
    const [slot] = psuFanSlots(withBoxes([psuBox({ ...FACE_DOWN, axis: 'z', side: 'max' })]).boxes);
    expect(slot.axis).toEqual([0, 0, -1]);
  });

  it('adds nothing for a PSU box that names no grille end', () => {
    expect(withBoxes([psuBox({ axis: 'y', side: 'min', count: 1, diameter: 120 })]).fanSlots).toEqual([]);
    expect(withBoxes([psuBox(undefined)]).fanSlots).toEqual([]);
  });

  it('drops an exhaust end on the fan axis itself', () => {
    expect(withBoxes([psuBox({ ...FACE_DOWN, exhaust: { axis: 'y', side: 'max' } })]).fanSlots).toEqual([]);
  });

  it('marks a fan over a case vent', () => {
    const [slot] = withBoxes([psuBox({ ...FACE_DOWN, draws: 'outside' })]).fanSlots;
    expect(slot.ventFed).toBe(true);
    expect(drawsCaseAir(slot)).toBe(false);
  });
});

describe('PSU fan in the flow model', () => {
  const layout = (fans: Record<string, unknown>) => withBoxes([psuBox(fans)]);
  const speeds = (l: ReturnType<typeof layout>) => new Map(l.fanSlots.map(s => [s.key, { fraction: 0.4, estimated: true }]));

  it('simulates an unbound PSU fan at its own slow speed', () => {
    const l = layout(FACE_DOWN);
    expect(withDefaultBindings([], l.fanSlots, [])).toEqual([{ channelId: simChannelId(PSU_SIM_RPM), slotKeys: ['psu:fan:0'] }]);
  });

  it('gives the PSU fan a rotor turning at the simulated speed', () => {
    const l = layout(FACE_DOWN);
    expect(fanRotorSpeeds(l.fanSlots, withDefaultBindings([], l.fanSlots, []), []).get('psu:fan:0')).toBe(PSU_SIM_RPM);
  });

  it('draws the fan into its box whatever the case direction override says', () => {
    const l = layout(FACE_DOWN);
    expect(slotDirections(l.fanSlots, { 'psu:fan:0': 'exhaust' })['psu:fan:0']).toBe('exhaust');
    expect(slotDirections(l.fanSlots, {})['psu:fan:0']).toBe('intake');
  });

  it('counts a case-drawing PSU fan as an exhaust fan in the case pressure model', () => {
    const l = layout(FACE_DOWN);
    const model = lumpedModel(l.fanSlots, [], speeds(l), slotDirections(l.fanSlots, {}));
    expect(model.fanCount).toBe(1);
    expect(model.result.exhaustCfm).toBeGreaterThan(0);
    expect(model.result.intakeCfm).toBe(0);
  });

  it('leaves a vent-fed PSU fan out of the case pressure model but still moves its own air', () => {
    const l = layout({ ...FACE_DOWN, draws: 'outside' });
    expect(lumpedModel(l.fanSlots, [], speeds(l), slotDirections(l.fanSlots, {})).fanCount).toBe(0);
    expect(visualFlow(l.fanSlots, [], speeds(l), slotDirections(l.fanSlots, {})).fanCfm['psu:fan:0']).toBeGreaterThan(0);
  });
});
