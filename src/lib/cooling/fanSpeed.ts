import type { FanSpec } from './pressureModel';

/** Top speed assumed for a fan whose spec and channel give none, rpm. */
export const SIM_RPM_MAX = 2500;
/** Rated top speed by frame size, rpm, for a fan whose spec and channel give none. */
export const DEFAULT_RPM_MAX: Readonly<Record<number, number>> = { 120: SIM_RPM_MAX, 140: SIM_RPM_MAX };
/** A speed fraction above this reads as noise, not a faster fan. */
const MAX_FRACTION = 1.2;
/** A fan's effective flow must change by more than this share before the flow is solved again: a fan curve easing a few hundred rpm is not a new scene. */
export const FLOW_CHANGE_TOLERANCE = 0.15;
/** And by more than this many CFM, so a slow fan's tach jitter never counts as a change. */
export const FLOW_CHANGE_FLOOR_CFM = 4;

export function defaultRpmMax(sizeMm: number): number {
  const sizes = Object.keys(DEFAULT_RPM_MAX).map(Number);
  const nearest = sizes.reduce((best, s) => (Math.abs(s - sizeMm) < Math.abs(best - sizeMm) ? s : best), sizes[0]);
  return DEFAULT_RPM_MAX[nearest];
}

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

/** A bound channel's speed as a share of the fan's top speed: the tach over the spec's rpmMax, else the channel's observed max, else a size default; duty stands in when the tach is unreadable. */
export function speedFraction(channel: ChannelSpeed, specRpmMax: number | undefined, sizeMm: number): SlotSpeed {
  if (channel.rpmUnavailable) return { fraction: clamp(channel.dutyPercent / 100), estimated: true };
  const observed = channel.maxRpm && channel.maxRpm > 0 ? channel.maxRpm : undefined;
  const top = specRpmMax ?? observed ?? defaultRpmMax(sizeMm);
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

/** Highest simulated speed accepted from a channel id, rpm. */
export const SIM_RPM_CEILING = 3000;
const SIM_PREFIX = 'sim:';

/** The fixed rpm of a simulated channel id (`sim:<rpm>`), clamped to the ceiling; null for any other id. */
export function simRpm(channelId: string): number | null {
  if (!channelId.startsWith(SIM_PREFIX)) return null;
  const rpm = Number.parseInt(channelId.slice(SIM_PREFIX.length), 10);
  return Number.isFinite(rpm) ? Math.min(SIM_RPM_CEILING, Math.max(0, rpm)) : null;
}

/** Share of rated flow shown for a fan at `fraction` of top speed: a spinning fan always moves, and the slowest reads about half the fastest. */
const VISUAL_FLOW_FLOOR = 0.45;
export function visualFlowCfm(ratedCfm: number, fraction: number): number {
  return fraction > 0 ? ratedCfm * (VISUAL_FLOW_FLOOR + (1 - VISUAL_FLOW_FLOOR) * Math.min(1, fraction)) : 0;
}
