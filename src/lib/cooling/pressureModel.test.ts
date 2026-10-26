import { describe, expect, it } from 'vitest';
import { defaultFanSpec, FAN_DEFAULTS, solveCasePressure, type PressureFan } from './pressureModel';

const fan = (key: string, direction: PressureFan['direction'], size = 120): PressureFan => ({ key, direction, ...defaultFanSpec(size) });

describe('defaultFanSpec', () => {
  it('uses the table and the nearest size for others', () => {
    expect(defaultFanSpec(120)).toEqual(FAN_DEFAULTS[120]);
    expect(defaultFanSpec(140)).toEqual(FAN_DEFAULTS[140]);
    expect(defaultFanSpec(200)).toEqual(FAN_DEFAULTS[140]);
    expect(defaultFanSpec(92)).toEqual(FAN_DEFAULTS[120]);
  });
});

describe('solveCasePressure', () => {
  it('is balanced with no fans', () => {
    const r = solveCasePressure([]);
    expect(r.mode).toBe('balanced');
    expect(r.fans).toEqual([]);
  });

  it('goes positive with more intake than exhaust', () => {
    const r = solveCasePressure([fan('a', 'intake'), fan('b', 'intake'), fan('c', 'exhaust')]);
    expect(r.mode).toBe('positive');
    expect(r.pressurePa).toBeGreaterThan(0);
    expect(r.netCfm).toBeGreaterThan(0);
    expect(r.ventCfm).toBeGreaterThan(0);
  });

  it('goes negative with more exhaust than intake', () => {
    const r = solveCasePressure([fan('a', 'intake'), fan('b', 'exhaust'), fan('c', 'exhaust')]);
    expect(r.mode).toBe('negative');
    expect(r.pressurePa).toBeLessThan(0);
    expect(r.ventCfm).toBeLessThan(0);
  });

  it('balances mirrored fans with the case near zero', () => {
    const r = solveCasePressure([fan('a', 'intake'), fan('b', 'exhaust')]);
    expect(r.mode).toBe('balanced');
    expect(r.fans[0].cfm).toBeCloseTo(r.fans[1].cfm, 3);
  });

  it('conserves flow at the operating point', () => {
    const r = solveCasePressure([fan('a', 'intake'), fan('b', 'intake'), fan('c', 'exhaust', 140)]);
    expect(r.intakeCfm - r.exhaustCfm - r.ventCfm).toBeCloseTo(0, 3);
  });

  it('keeps each fan within its rated flow and loses flow as pressure builds', () => {
    const r = solveCasePressure([fan('a', 'intake'), fan('b', 'intake'), fan('c', 'intake'), fan('d', 'exhaust')]);
    for (const f of r.fans) {
      expect(f.cfm).toBeGreaterThanOrEqual(0);
      expect(f.cfm).toBeLessThanOrEqual(FAN_DEFAULTS[120].cfm);
    }
    expect(r.fans[0].cfm).toBeLessThan(FAN_DEFAULTS[120].cfm);
  });

  it('a tighter vent builds more pressure', () => {
    const fans = [fan('a', 'intake'), fan('b', 'intake'), fan('c', 'exhaust')];
    expect(solveCasePressure(fans, 0.002).pressurePa).toBeGreaterThan(solveCasePressure(fans, 0.02).pressurePa);
  });

  it('ignores fans with no usable spec', () => {
    const r = solveCasePressure([{ key: 'x', direction: 'intake', cfm: 0, staticMmH2O: 1.8 }]);
    expect(r.fans).toEqual([]);
  });
});
