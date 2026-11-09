import type { FanSpec } from './pressureModel';

/** Top speed assumed for a fan whose spec and channel give none, rpm. */
export const UNKNOWN_SPEC_RPM_MAX = 2500;
/** A speed fraction above this reads as noise, not a faster fan; the stats and the particles share this cap. */
export const MAX_FRACTION = 1.2;
/** Simulated fans: a channel id `sim:<rpm>` pins a fan to a fixed speed with no device behind it. */
export const SIM_PREFIX = 'sim:';
/** Highest simulated speed, rpm. */
export const SIM_RPM_CEILING = 3000;
/** A fan's effective flow must change by more than this share before the flow is solved again: a fan curve easing a few hundred rpm is not a new scene. */
export const FLOW_CHANGE_TOLERANCE = 0.15;
/** And by more than this many CFM, so a slow fan's tach jitter never counts as a change. */
export const FLOW_CHANGE_FLOOR_CFM = 4;

export interface ChannelSpeed {
  rpm: number;
  dutyPercent: number;
  maxRpm?: number | null;
  rpmUnavailable?: boolean;
}

export interface SlotSpeed {
  /** Share of rated speed, 0 for a stopped fan. */
  fraction: number;
  /** True when the top speed or the reading is a stand-in, not the spec and a tach. */
  estimated: boolean;
}

/** A bound channel's speed as a share of the fan's top speed: the tach over the spec's rpmMax, else the channel's observed max, else the unknown-spec default; duty stands in when the tach is unreadable. */
export function speedFraction(channel: ChannelSpeed, specRpmMax: number | undefined): SlotSpeed {
  if (channel.rpmUnavailable) return { fraction: clamp(channel.dutyPercent / 100), estimated: true };
  const observed = channel.maxRpm && channel.maxRpm > 0 ? channel.maxRpm : undefined;
  const top = specRpmMax ?? observed ?? UNKNOWN_SPEC_RPM_MAX;
  return { fraction: clamp(channel.rpm / top), estimated: specRpmMax === undefined };
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(MAX_FRACTION, Math.max(0, v)) : 0);

/** Fan laws: flow follows speed, static pressure follows its square. */
export function scaledSpec(spec: FanSpec, fraction: number): FanSpec {
  return { cfm: spec.cfm * fraction, staticMmH2O: spec.staticMmH2O * fraction * fraction };
}

/** The previous flows when no fan changed by more than the larger of the tolerance share and the CFM floor, else the new ones; a changed set of fans always counts. */
export function settleFlows(prev: Readonly<Record<string, number>>, next: Readonly<Record<string, number>>, tolerance = FLOW_CHANGE_TOLERANCE, floorCfm = FLOW_CHANGE_FLOOR_CFM): Readonly<Record<string, number>> {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (a === undefined || b === undefined) return next;
    if (Math.abs(b - a) > Math.max(tolerance * Math.abs(a), floorCfm)) return next;
  }
  return prev;
}

/** The fixed rpm of a simulated channel id (`sim:<rpm>`), clamped to the ceiling; null for any other id. */
export function simRpm(channelId: string): number | null {
  if (!channelId.startsWith(SIM_PREFIX)) return null;
  const rpm = Number.parseInt(channelId.slice(SIM_PREFIX.length), 10);
  return Number.isFinite(rpm) ? Math.min(SIM_RPM_CEILING, Math.max(0, rpm)) : null;
}

/** Share of rated flow shown for a fan at `fraction` of top speed: a spinning fan always moves, and the slowest still reads as clearly moving. The same speed cap as the stats. */
const VISUAL_FLOW_FLOOR = 0.3;
export function visualFlowCfm(ratedCfm: number, fraction: number): number {
  return fraction > 0 ? ratedCfm * (VISUAL_FLOW_FLOOR + (1 - VISUAL_FLOW_FLOOR) * Math.min(MAX_FRACTION, fraction)) : 0;
}

/** Time constant and step of the drawn flow's approach to a new fan speed, ms: a fan that starts or stops (a card's zero rpm mode) eases in and out instead of switching. */
export const FLOW_EASE_TAU_MS = 1000;
export const FLOW_EASE_STEP_MS = 500;

/** One step of each flow toward its target, closing a share of the gap set by `dtMs`; the target itself once every flow is within the settle band of it, or when the set of fans changed. Keys in `direct` are not fans: they take the target's value at once and do not count toward settling. */
export function easeFlows(prev: Readonly<Record<string, number>>, target: Readonly<Record<string, number>>, dtMs: number = FLOW_EASE_STEP_MS, direct: readonly string[] = []): Readonly<Record<string, number>> {
  const keys = Object.keys(target);
  if (keys.length !== Object.keys(prev).length || keys.some(k => prev[k] === undefined)) return target;
  const share = 1 - Math.exp(-dtMs / FLOW_EASE_TAU_MS);
  const next: Record<string, number> = {};
  let settled = true;
  for (const k of keys) {
    if (direct.includes(k)) { next[k] = target[k]; continue; }
    const gap = target[k] - prev[k];
    if (Math.abs(gap) > Math.max(FLOW_CHANGE_TOLERANCE * Math.abs(target[k]), FLOW_CHANGE_FLOOR_CFM)) settled = false;
    next[k] = prev[k] + gap * share;
  }
  return settled ? target : next;
}
