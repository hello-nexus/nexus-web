import { describe, expect, it } from 'vitest';
import y70Layout from './__fixtures__/y70-case-layout.json';
import t1State from './__fixtures__/t1-cooling-state.json';
import { parseCaseLayout, type CaseLayout } from './caseLayout';
import { slotModelFans } from './fanSpecs';
import { defaultFanSpec } from './pressureModel';
import { pressureFans, slotDirections, withDefaultBindings } from './slotFlow';

const base = y70Layout as unknown as { size: number[]; boxes: object[]; fanSlots: object[] };
const withCooler = (fans: object | undefined, min = [60, 100, 120], size = [105, 126, 155]) =>
  parseCaseLayout({ ...base, boxes: [...base.boxes.filter(b => (b as { slot: string }).slot !== 'cooler'), { slot: 'cooler', role: 'part', min, size, ...(fans ? { fans } : {}) }] }) as CaseLayout;
const cpuFans = (l: CaseLayout) => l.fanSlots.filter(s => s.key.startsWith('cpu:fan:'));

describe('air cooler fan slots', () => {
  it('puts a low-profile cooler fan top-down on its axis face', () => {
    const l = withCooler({ axis: 'z', side: 'min', count: 1, diameter: 86 }, [60, 100, 120], [98, 98, 47]);
    const [fan] = cpuFans(l);
    expect(cpuFans(l)).toHaveLength(1);
    expect(fan).toMatchObject({ key: 'cpu:fan:0', position: 'cpu', size: 92, taken: 'fan', axis: [0, 0, 1] });
    expect(fan.box?.min[2]).toBe(120);
    expect(fan.box?.size).toEqual([92, 92, 25]);
    expect(fan.box?.min.slice(0, 2)).toEqual([63, 103]);
  });

  it('puts a single tower fan front to back and a max side fan the other way', () => {
    expect(cpuFans(withCooler({ axis: 'x', side: 'min', count: 1, diameter: 114 }))[0].axis).toEqual([1, 0, 0]);
    expect(cpuFans(withCooler({ axis: 'x', side: 'max', count: 1, diameter: 114 }))[0].axis).toEqual([-1, 0, 0]);
  });

  it('puts both fans of a dual tower in series along the axis', () => {
    const l = withCooler({ axis: 'x', side: 'min', count: 1, diameter: 114, stack: 2 }, [60, 100, 120], [150, 126, 155]);
    const fans = cpuFans(l);
    expect(fans.map(f => f.key)).toEqual(['cpu:fan:0', 'cpu:fan:1']);
    expect(fans.map(f => f.box?.min[0])).toEqual([60, 185]);
    expect(fans.every(f => f.axis?.[0] === 1)).toBe(true);
  });

  it('leaves the AIO radiator slots unchanged and adds no cooler slot for it', () => {
    const l = parseCaseLayout((t1State as { caseLayout: unknown }).caseLayout) as CaseLayout;
    expect(cpuFans(l)).toHaveLength(0);
    expect(l.fanSlots.filter(s => s.key.startsWith('rad:'))).toHaveLength(3);
  });

  it('adds nothing for a cooler with no fan data', () => {
    expect(cpuFans(withCooler(undefined))).toHaveLength(0);
    expect(cpuFans(withCooler({ axis: 'x', side: 'min', diameter: 114 }))).toHaveLength(0);
  });

  it('carries a stated airflow, else models the size default like any fan of unknown airflow', () => {
    const stated = cpuFans(withCooler({ axis: 'x', side: 'min', count: 1, diameter: 114, airflowCfm: 61.5 }))[0];
    expect(stated.fan?.airflowCfm).toBe(61.5);
    expect(slotModelFans(stated, [])[0]).toMatchObject({ cfm: 61.5, estimated: true });
    const unknown = cpuFans(withCooler({ axis: 'x', side: 'min', count: 1, diameter: 114 }))[0];
    expect(unknown.fan).toBeUndefined();
    expect(slotModelFans(unknown, [])[0].cfm).toBe(defaultFanSpec(120).cfm);
  });

  it('simulates the fan as an internal intake fan that stays out of the case-wide pressure model', () => {
    const l = withCooler({ axis: 'x', side: 'min', count: 1, diameter: 114 });
    const fan = cpuFans(l)[0];
    expect(slotDirections([fan], {})['cpu:fan:0']).toBe('intake');
    expect(pressureFans([fan], [], new Map(), { 'cpu:fan:0': 'intake' }).fans).toEqual([]);
    expect(withDefaultBindings([], l.fanSlots, []).some(b => b.slotKeys.includes('cpu:fan:0'))).toBe(true);
  });
});
