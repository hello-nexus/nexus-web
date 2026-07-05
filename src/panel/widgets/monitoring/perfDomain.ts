import type { DeviceKey } from './perfSlots';
import type { GaugeDesignKey } from './gauges';

export type ScaleMode = 'adaptive' | 'fixed';

export const DEFAULT_SCALE_MODE: ScaleMode = 'adaptive';

/** Designs that normalize raw history through historyDomain, so a Y range applies. */
const SCALABLE_DESIGNS = new Set<GaugeDesignKey>([
  'sparkline', 'line', 'mirrorwave', 'heatmap', 'backdrop',
]);

export function designSupportsScale(design: GaugeDesignKey): boolean {
  return SCALABLE_DESIGNS.has(design);
}

export function chartDomainForScale(
  device: DeviceKey,
  rawValue: number,
  history: readonly number[],
  staticMax: number,
  scale: ScaleMode,
  sensorName?: string,
  sensorType?: string,
): [number, number] {
  if (scale === 'fixed') return [0, staticMax];
  return relativeHistoryDomain(device, rawValue, history, staticMax, sensorName, sensorType);
}

const PERCENT_FLOOR = 25;
const PERCENT_STEP = 25;
const FAN_FLOOR = 1200;
const FAN_STEP = 500;
const FPS_FLOOR = 60;
const FPS_STEP = 30;
const FRAME_TIME_FLOOR = 20;
const FRAME_TIME_STEP = 10;
const MOTHERBOARD_TEMP_FLOOR = 50;

/**
 * Relative chart domain for the panel performance line gauges. Lower bound
 * stays at 0; upper bound stretches up to the largest observed sample, with a
 * per-metric floor so a flat-zero line still has visible chart area and a
 * flat-mid line does not jam against the ceiling.
 *
 * Network passes its already-relative ceiling via `staticMax` (computed by
 * `networkMaxValue`), which is adopted as-is.
 */
export function relativeHistoryDomain(
  device: DeviceKey,
  rawValue: number,
  history: readonly number[],
  staticMax: number,
  sensorName?: string,
  sensorType?: string,
): [number, number] {
  if (device === 'network') return [0, staticMax];

  let observed = Number.isFinite(rawValue) ? rawValue : 0;
  for (const v of history) {
    if (Number.isFinite(v) && v > observed) observed = v;
  }

  if (device === 'fan') {
    return [0, Math.max(FAN_FLOOR, Math.ceil(observed / FAN_STEP) * FAN_STEP)];
  }
  if (device === 'fps') {
    if (sensorName === 'Frame Time') {
      return [0, Math.max(FRAME_TIME_FLOOR, Math.ceil(observed / FRAME_TIME_STEP) * FRAME_TIME_STEP)];
    }
    return [0, Math.max(FPS_FLOOR, Math.ceil(observed / FPS_STEP) * FPS_STEP)];
  }
  if (device === 'motherboard') {
    if (sensorType === 'Fan') {
      return [0, Math.max(FAN_FLOOR, Math.ceil(observed / FAN_STEP) * FAN_STEP)];
    }
    if (sensorType === 'Temperature') {
      const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
      return [0, Math.max(MOTHERBOARD_TEMP_FLOOR, Math.min(100, stretched))];
    }
    if (sensorType === 'Load' || sensorType === 'Control' || sensorType === 'Level') {
      const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
      return [0, Math.max(PERCENT_FLOOR, Math.min(100, stretched))];
    }
    // Voltage/Clock/other: no natural percent ceiling, stretch to the
    // observed maximum instead (mirrors percentForSensor's value/maxValue scaling).
    return [0, Math.max(1, Math.ceil(observed))];
  }
  // cpu/gpu/memory/storage report 0-100 percent; clamp to 100 ceiling.
  const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
  return [0, Math.max(PERCENT_FLOOR, Math.min(100, stretched))];
}
