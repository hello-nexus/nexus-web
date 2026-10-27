import { describe, expect, it } from 'vitest';
import { scaledSpec } from './fanSpeed';
import { defaultFanSpec, FAN_DEFAULTS, RADIATOR_LOSS_K, seriesLoss, solveCasePressure, type PressureFan } from './pressureModel';

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

describe('fan operating point', () => {
  const PA = 9.80665;
  const M3S = 0.000471947;

  it('meets the fan curve and the vent orifice at one point', () => {
    const f = fan('a', 'intake');
    const r = solveCasePressure([f]);
    const qFan = f.cfm * M3S * (1 - r.pressurePa / (f.staticMmH2O * PA));
    const qVent = 0.6 * 0.012 * Math.sqrt((2 * r.pressurePa) / 1.2);
    expect(r.pressurePa).toBeGreaterThan(0);
    expect(qFan).toBeCloseTo(qVent, 6);
    expect(r.fans[0].cfm * M3S).toBeCloseTo(qFan, 6);
  });

  it('follows the affinity laws: flow with rpm, pressure with rpm squared', () => {
    const base = { cfm: 60, staticMmH2O: 1.8 };
    const half = scaledSpec(base, 0.5);
    expect(half.cfm).toBeCloseTo(30, 10);
    expect(half.staticMmH2O).toBeCloseTo(0.45, 10);
    // Against a quadratic case impedance the whole operating point scales with rpm: half the speed moves half the air at a quarter of the pressure.
    const full = solveCasePressure([{ ...fan('a', 'intake'), ...base }]);
    const slow = solveCasePressure([{ ...fan('a', 'intake'), ...half }]);
    expect(slow.fans[0].cfm).toBeCloseTo(0.5 * full.fans[0].cfm, 6);
    expect(slow.pressurePa).toBeCloseTo(0.25 * full.pressurePa, 6);
  });

  it('a radiator in series with a fan takes pressure off its curve and flow with it', () => {
    const plain = solveCasePressure([fan('a', 'intake')]);
    const behind = solveCasePressure([{ ...fan('a', 'intake'), loss: seriesLoss(RADIATOR_LOSS_K, 120) }]);
    expect(behind.fans[0].cfm).toBeLessThan(plain.fans[0].cfm);
    // Its flow still sits on the curve less the loss: P_fan(Q) - loss Q^2 equals the case pressure.
    const f = { ...fan('a', 'intake'), loss: seriesLoss(RADIATOR_LOSS_K, 120) };
    const q = behind.fans[0].cfm * M3S;
    const ps = f.staticMmH2O * PA;
    expect(ps * (1 - q / (f.cfm * M3S)) - f.loss * q * q).toBeCloseTo(behind.pressurePa, 4);
  });

  it('more fans in than out make the case positive, the reverse negative, and equal balanced', () => {
    expect(solveCasePressure([fan('a', 'intake'), fan('b', 'intake'), fan('c', 'exhaust')]).mode).toBe('positive');
    expect(solveCasePressure([fan('a', 'intake'), fan('b', 'exhaust'), fan('c', 'exhaust')]).mode).toBe('negative');
    expect(solveCasePressure([fan('a', 'intake'), fan('b', 'exhaust')]).mode).toBe('balanced');
  });
});
