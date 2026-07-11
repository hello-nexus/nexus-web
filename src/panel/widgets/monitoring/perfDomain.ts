import type { HardwareSensor } from '../../../hooks/useSensors';
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

// Adaptive fallback ceiling for a Clock sensor on a heterogeneous-type
// device (motherboard and the other mixed-bag categories below) with no
// theoreticalMaximum - clock sensors don't carry an installed-capacity max
// the way Data sensors do.
const HETEROGENEOUS_CLOCK_MAX = 6000;

// Fixed-mode default ceiling for network sensors, in the sensor's own unit
// (bytes/sec - see networkSensors.ts formatNetworkRate). 1 Gbps. Network
// sensors carry no theoreticalMaximum, so this is the only ceiling
// defaultFixedMax has to offer; unlike the adaptive networkMaxValue it does
// not track live throughput, or a Fixed axis wouldn't stay fixed.
const NETWORK_FIXED_DEFAULT_MAX_BPS = 125_000_000;

// Devices whose sensors are a heterogeneous LHM component (mixed Load/
// Control/Level/Temperature alongside Fan/Clock/Voltage/Data/etc), needing
// the same type-aware scaling motherboard already uses - SSD SMART and every
// extras-topic device group are the same shape of mixed bag.
const HETEROGENEOUS_TYPE_DEVICES = new Set<DeviceKey>([
  'motherboard', 'smart', 'memoryModule', 'battery', 'nic', 'cooler', 'psu', 'embeddedController',
]);

export function isHeterogeneousTypeDevice(device: DeviceKey): boolean {
  return HETEROGENEOUS_TYPE_DEVICES.has(device);
}

export function staticMaxForDevice(device: DeviceKey, sensorName?: string, sensorType?: string): number {
  if (device === 'fan') return 2500;
  if (device === 'storage') return 100;
  if (device === 'fps') return sensorName === 'Frame Time' ? 50 : 240;
  if (device === 'network') return NETWORK_FIXED_DEFAULT_MAX_BPS;
  if (isHeterogeneousTypeDevice(device)) {
    switch (sensorType) {
      case 'Fan': return 2500;
      case 'Clock': return HETEROGENEOUS_CLOCK_MAX;
      case 'Voltage': return 2;
      default: return 100;
    }
  }
  // Load/temperature/clock sensors: percentage max.
  return 100;
}

// Ceiling for a slot's Fixed-range upper bound when the user hasn't set an
// override: the sensor's own capacity when it carries one, else the same
// per-device static ceiling the adaptive path falls back to.
export function defaultFixedMax(device: DeviceKey, sensor: HardwareSensor | undefined, nameFallback?: string): number {
  const sMax = sensor?.theoreticalMaximum && sensor.theoreticalMaximum > 0 ? sensor.theoreticalMaximum : 0;
  return sMax || staticMaxForDevice(device, sensor?.name ?? nameFallback, sensor?.type);
}

export function chartDomainForScale(
  device: DeviceKey,
  rawValue: number,
  history: readonly number[],
  staticMax: number,
  scale: ScaleMode,
  sensorName?: string,
  sensorType?: string,
  fixedMin?: number,
  fixedMax?: number,
  fixedDefaultMax?: number,
): [number, number] {
  if (scale === 'fixed') {
    const dmax = Number.isFinite(fixedDefaultMax) && (fixedDefaultMax as number) > 0 ? (fixedDefaultMax as number) : staticMax;
    const rawMax = Number.isFinite(fixedMax) && (fixedMax as number) > 0 ? (fixedMax as number) : dmax;
    const rawMin = Number.isFinite(fixedMin) ? (fixedMin as number) : 0;
    // A stored min/max can outlive the slot's device/sensor swapping to one
    // with a smaller ceiling; clamp into [0, dmax] so a stale override
    // degrades to the guard below instead of an inverted or negative-span
    // domain.
    const max = Math.max(0, Math.min(rawMax, dmax));
    const min = Math.max(0, Math.min(rawMin, dmax));
    return min < max ? [min, max] : [0, dmax];
  }
  return relativeHistoryDomain(device, rawValue, history, staticMax, sensorName, sensorType);
}

// Nearest "nice" 1/2/5-times-power-of-ten value to `raw`, used to pick a
// slider step that scales with the axis instead of a flat 1 unit (which
// leaves a sub-100 ceiling, e.g. a 2V sensor, with only 3 selectable values).
function nearestNiceValue(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  let best = Math.pow(10, exponent);
  let bestDist = Math.abs(raw - best);
  for (let exp = exponent - 1; exp <= exponent + 1; exp++) {
    for (const mult of [1, 2, 5]) {
      const candidate = mult * Math.pow(10, exp);
      const dist = Math.abs(raw - candidate);
      if (dist < bestDist) { bestDist = dist; best = candidate; }
    }
  }
  return best;
}

// Slider step for a Fixed-range ceiling of `defMax`: roughly 100 steps
// across the axis, snapped to a nice round increment.
export function niceStep(defMax: number): number {
  return nearestNiceValue(defMax / 100);
}

const PERCENT_FLOOR = 25;
const PERCENT_STEP = 25;
const FAN_FLOOR = 1200;
const FAN_STEP = 500;
const FPS_FLOOR = 60;
const FPS_STEP = 30;
const FRAME_TIME_FLOOR = 20;
const FRAME_TIME_STEP = 10;
const HETEROGENEOUS_TEMP_FLOOR = 50;

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
  if (isHeterogeneousTypeDevice(device)) {
    if (sensorType === 'Fan') {
      return [0, Math.max(FAN_FLOOR, Math.ceil(observed / FAN_STEP) * FAN_STEP)];
    }
    if (sensorType === 'Temperature') {
      const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
      return [0, Math.max(HETEROGENEOUS_TEMP_FLOOR, Math.min(100, stretched))];
    }
    if (sensorType === 'Load' || sensorType === 'Control' || sensorType === 'Level') {
      const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
      return [0, Math.max(PERCENT_FLOOR, Math.min(100, stretched))];
    }
    // Voltage/Clock/other: no natural percent ceiling, stretch to the
    // observed maximum instead (mirrors percentForSensor's value/maxValue scaling).
    return [0, Math.max(1, Math.ceil(observed))];
  }
  // quick/cpu/gpu/memory/storage: percent- and temperature-typed sensors are
  // 0-100 and clamp to a 100 ceiling.
  if (sensorType === undefined || sensorType === 'Load' || sensorType === 'Control'
    || sensorType === 'Level' || sensorType === 'Temperature') {
    const stretched = Math.ceil(observed / PERCENT_STEP) * PERCENT_STEP;
    return [0, Math.max(PERCENT_FLOOR, Math.min(100, stretched))];
  }
  // Non-percent types (SmallData/Data/Clock/Power/Voltage - e.g. GPU Memory Used
  // in MB) have no percent ceiling: stretch to the observed max, or the adaptive
  // line overflows the top of the chart.
  return [0, Math.max(1, Math.ceil(observed))];
}
