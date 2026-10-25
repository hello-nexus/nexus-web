import { describe, expect, it } from 'vitest';
import { defaultRpmMax, scaledSpec, settleFlows, speedFraction, FLOW_CHANGE_FLOOR_CFM } from './fanSpeed';
import { slotModelFans } from './fanSpecs';
import { solveCasePressure } from './pressureModel';
import type { CaseFanSlot } from './caseLayout';

const slot = (over: Partial<CaseFanSlot> = {}): CaseFanSlot => ({ key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', ...over });

describe('fan laws', () => {
  it('scale flow with speed and static pressure with its square', () => {
    expect(scaledSpec({ cfm: 60, staticMmH2O: 1.8 }, 0.5)).toEqual({ cfm: 30, staticMmH2O: 0.45 });
    expect(scaledSpec({ cfm: 60, staticMmH2O: 1.8 }, 1)).toEqual({ cfm: 60, staticMmH2O: 1.8 });
    expect(scaledSpec({ cfm: 60, staticMmH2O: 1.8 }, 0)).toEqual({ cfm: 0, staticMmH2O: 0 });
  });
});

describe('speedFraction', () => {
  const ch = (rpm: number, extra = {}) => ({ rpm, dutyPercent: 40, ...extra });

  it('uses the spec top speed, then the channel max, then a size default, marking the stand-ins as estimates', () => {
    expect(speedFraction(ch(900), 1800, 120)).toEqual({ fraction: 0.5, estimated: false });
    expect(speedFraction(ch(900, { maxRpm: 1200 }), undefined, 120)).toEqual({ fraction: 0.75, estimated: true });
    expect(speedFraction(ch(750), undefined, 120).fraction).toBeCloseTo(750 / defaultRpmMax(120));
    expect(defaultRpmMax(140)).toBe(defaultRpmMax(120));
  });

  it('gives 0 for a stopped fan and clamps a runaway reading', () => {
    expect(speedFraction(ch(0), 1800, 120).fraction).toBe(0);
    expect(speedFraction(ch(99999), 1800, 120).fraction).toBeLessThanOrEqual(1.2);
    expect(speedFraction(ch(Number.NaN), 1800, 120).fraction).toBe(0);
  });

  it('falls back to duty when the tach cannot be read', () => {
    expect(speedFraction({ rpm: 0, dutyPercent: 60, rpmUnavailable: true }, 1800, 120)).toEqual({ fraction: 0.6, estimated: true });
  });
});

describe('slotModelFans with a live speed', () => {
  it('keeps the rated curve for an unbound fan and scales a bound one', () => {
    const rated = slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), [])[0];
    const half = slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), [], { fraction: 0.5, estimated: false })[0];
    expect(rated).toMatchObject({ cfm: 80, staticMmH2O: 2 });
    expect(half).toMatchObject({ cfm: 40, staticMmH2O: 0.5, estimated: false });
    expect(slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), [], { fraction: 0.5, estimated: true })[0].estimated).toBe(true);
  });

  it('gives a stopped fan no flow, so the lumped model drops it and a stopped fan is a vent', () => {
    const stopped = slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), [], { fraction: 0, estimated: false })[0];
    expect(stopped.cfm).toBe(0);
    const r = solveCasePressure([{ ...stopped, direction: 'intake' }]);
    expect(r.fans).toEqual([]);
  });

  it('scales a radiator fan too, and the lumped flow follows the slower fan', () => {
    const rad = slot({ taken: 'radiator', size: 240, radiator: { fanCount: 2, fanAirflowCfm: 60, fanStaticPressureMmH2O: 2 } });
    const fans = slotModelFans(rad, [], { fraction: 0.5, estimated: false });
    expect(fans).toHaveLength(2);
    expect(fans[0].cfm).toBe(30);
    const full = solveCasePressure(slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), []).map(f => ({ ...f, direction: 'intake' as const })));
    const slow = solveCasePressure(slotModelFans(slot({ fan: { airflowCfm: 80, staticPressureMmH2O: 2 } }), [], { fraction: 0.5, estimated: false }).map(f => ({ ...f, direction: 'intake' as const })));
    expect(slow.fans[0].cfm).toBeLessThan(full.fans[0].cfm);
    expect(slow.fans[0].cfm / full.fans[0].cfm).toBeGreaterThan(0.3);
    expect(slow.fans[0].cfm / full.fans[0].cfm).toBeLessThan(0.7);
  });
});

describe('settleFlows hysteresis', () => {
  const base = { a: 40, b: 60, '#vent': -10 };

  it('keeps the old flows while every fan stays within the tolerance of them', () => {
    expect(settleFlows(base, { a: 43, b: 54, '#vent': -10.3 })).toBe(base);
  });

  it('lets a real change through, a fan stopping or starting, and a changed set of fans', () => {
    const big = { a: 50, b: 60, '#vent': -10 };
    expect(settleFlows(base, big)).toBe(big);
    const stopped = { a: 0, b: 60, '#vent': -10 };
    expect(settleFlows(base, stopped)).toBe(stopped);
    const more = { ...base, c: 20 };
    expect(settleFlows(base, more)).toBe(more);
  });

  it('does not storm: a jittering reading around one speed never replaces the settled flows', () => {
    let settled: Readonly<Record<string, number>> = base;
    let changes = 0;
    for (let i = 0; i < 200; i++) {
      const jitter = 1 + Math.sin(i * 1.7) * 0.06;
      const next = settleFlows(settled, { a: 40 * jitter, b: 60 * jitter, '#vent': -10 * jitter });
      if (next !== settled) changes++;
      settled = next;
    }
    expect(changes).toBe(0);
  });
});

describe('settleFlows with a CFM floor', () => {
  // A 120 mm fan rated 60 CFM at 1500 rpm: 30 rpm of tach jitter is 1.2 CFM.
  const cfmAt = (rpm: number) => scaledSpec({ cfm: 60, staticMmH2O: 1.8 }, rpm / 1500).cfm;

  it.each([[480], [1450]])('does not re-solve for plus or minus 30 rpm of jitter around %i rpm over many updates', rpm => {
    let settled: Readonly<Record<string, number>> = { a: cfmAt(rpm), b: 40 };
    let changes = 0;
    for (let i = 0; i < 500; i++) {
      const jitter = Math.round(Math.sin(i * 2.3) * 30);
      const next = settleFlows(settled, { a: cfmAt(rpm + jitter), b: 40 });
      if (next !== settled) changes++;
      settled = next;
    }
    expect(changes).toBe(0);
  });

  it('does re-solve for a real step change, from a slow fan too', () => {
    const slow = { a: cfmAt(480) };
    expect(settleFlows(slow, { a: cfmAt(480) + FLOW_CHANGE_FLOOR_CFM + 1 })).not.toBe(slow);
    const fast = { a: cfmAt(1450) };
    expect(settleFlows(fast, { a: cfmAt(1000) })).not.toBe(fast);
  });
});

describe('a fan curve easing the rpm', () => {
  // T1 over 30 s: 950, 991, 1038, 1043, 1015, 1005, 967, 950 rpm on a 1500 rpm fan, then a real ramp to 1163.
  const cfmAt = (rpm: number) => scaledSpec({ cfm: 60, staticMmH2O: 1.8 }, rpm / 1500).cfm;

  it('never re-solves for the drift, and does for the ramp', () => {
    let settled: Readonly<Record<string, number>> = { a: cfmAt(950) };
    let changes = 0;
    for (const rpm of [952, 991, 1038, 1044, 1043, 1035, 1015, 1007, 1005, 967, 954, 948, 952, 978, 995]) {
      const next = settleFlows(settled, { a: cfmAt(rpm) });
      if (next !== settled) changes++;
      settled = next;
    }
    expect(changes).toBe(0);
    expect(settleFlows(settled, { a: cfmAt(1163) })).not.toBe(settled);
  });
});
