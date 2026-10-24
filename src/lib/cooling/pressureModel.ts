/** Lumped case-pressure model: one case node at gauge pressure p, fans and one vent on it. Ranks setups; not calibrated. */

export type FanDirection = 'intake' | 'exhaust';

export interface FanSpec {
  cfm: number;
  staticMmH2O: number;
}

/** Size-based fan specs used when a catalog value is missing, keyed by frame size in mm. */
export const FAN_DEFAULTS: Readonly<Record<number, FanSpec>> = {
  120: { cfm: 60, staticMmH2O: 1.8 },
  140: { cfm: 70, staticMmH2O: 1.6 },
};

/** Open area of the case's unfanned openings, m^2. */
export const DEFAULT_VENT_AREA_M2 = 0.012;
const DISCHARGE_COEFFICIENT = 0.6;
const AIR_DENSITY = 1.2;
const PA_PER_MMH2O = 9.80665;
const M3S_PER_CFM = 0.000471947;
// Gauge pressures inside this band read as balanced.
const BALANCED_BAND_PA = 0.25;
const BISECTION_STEPS = 60;

export function defaultFanSpec(sizeMm: number): FanSpec {
  const sizes = Object.keys(FAN_DEFAULTS).map(Number);
  const nearest = sizes.reduce((best, s) => (Math.abs(s - sizeMm) < Math.abs(best - sizeMm) ? s : best), sizes[0]);
  return FAN_DEFAULTS[nearest];
}

export interface PressureFan extends FanSpec {
  key: string;
  direction: FanDirection;
}

export interface PressureResult {
  mode: 'positive' | 'negative' | 'balanced';
  /** Case gauge pressure, Pa. */
  pressurePa: number;
  /** Intake minus exhaust at the operating point, CFM; positive means the case is pushed up. */
  netCfm: number;
  intakeCfm: number;
  exhaustCfm: number;
  /** Air leaving (positive) or entering (negative) through the unfanned openings, CFM. */
  ventCfm: number;
  fans: { key: string; cfm: number }[];
}

const toCfm = (m3s: number) => m3s / M3S_PER_CFM;

function fanFlow(fan: PressureFan, p: number): number {
  const qMax = fan.cfm * M3S_PER_CFM;
  const ps = fan.staticMmH2O * PA_PER_MMH2O;
  if (!(qMax > 0) || !(ps > 0)) return 0;
  const dp = fan.direction === 'intake' ? p : -p;
  return Math.min(qMax, Math.max(0, qMax * (1 - dp / ps)));
}

// Net flow into the case at pressure p; falls as p rises.
function balance(fans: readonly PressureFan[], ventArea: number, p: number): number {
  let net = 0;
  for (const f of fans) net += (f.direction === 'intake' ? 1 : -1) * fanFlow(f, p);
  const vent = DISCHARGE_COEFFICIENT * ventArea * Math.sqrt((2 * Math.abs(p)) / AIR_DENSITY);
  return net - Math.sign(p) * vent;
}

export function solveCasePressure(fans: readonly PressureFan[], ventAreaM2 = DEFAULT_VENT_AREA_M2): PressureResult {
  const valid = fans.filter(f => f.cfm > 0 && f.staticMmH2O > 0);
  const area = Math.max(0, ventAreaM2);
  const bound = Math.max(1, ...valid.map(f => f.staticMmH2O * PA_PER_MMH2O));
  let lo = -bound;
  let hi = bound;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (balance(valid, area, mid) > 0) lo = mid; else hi = mid;
  }
  const p = (lo + hi) / 2;
  const flows = valid.map(f => ({ key: f.key, cfm: toCfm(fanFlow(f, p)), direction: f.direction }));
  const intakeCfm = flows.filter(f => f.direction === 'intake').reduce((s, f) => s + f.cfm, 0);
  const exhaustCfm = flows.filter(f => f.direction === 'exhaust').reduce((s, f) => s + f.cfm, 0);
  const ventCfm = toCfm(Math.sign(p) * DISCHARGE_COEFFICIENT * area * Math.sqrt((2 * Math.abs(p)) / AIR_DENSITY));
  return {
    mode: Math.abs(p) <= BALANCED_BAND_PA ? 'balanced' : p > 0 ? 'positive' : 'negative',
    pressurePa: p,
    netCfm: intakeCfm - exhaustCfm,
    intakeCfm,
    exhaustCfm,
    ventCfm,
    fans: flows.map(({ key, cfm }) => ({ key, cfm })),
  };
}
