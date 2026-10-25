import type { FanSpec } from './pressureModel';

/** Rated top speed by frame size, rpm, for a fan whose spec and channel give none. */
export const DEFAULT_RPM_MAX: Readonly<Record<number, number>> = { 120: 1500, 140: 1200 };
/** A speed fraction above this reads as noise, not a faster fan. */
const MAX_FRACTION = 1.2;
/** A fan's effective flow must change by more than this share before the flow is solved again. */
export const FLOW_CHANGE_TOLERANCE = 0.05;
/** And by more than this many CFM, so a slow fan's tach jitter never counts as a change. */
export const FLOW_CHANGE_FLOOR_CFM = 2;

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
