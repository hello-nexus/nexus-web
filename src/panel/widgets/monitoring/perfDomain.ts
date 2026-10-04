import type { HardwareSensor } from '../../../hooks/useSensors';
import type { DeviceKey } from './perfSlots';
import type { GaugeDesignKey } from './gauges';

export type ScaleMode = 'adaptive' | 'fixed';

export const DEFAULT_SCALE_MODE: ScaleMode = 'adaptive';

/** Designs that normalize raw history through historyDomain, so a Y range applies. */
const SCALABLE_DESIGNS = new Set<GaugeDesignKey>([
  'sparkline', 'line', 'mirrorwave', 'heatmap', 'backdrop',
]);

// Value-fill designs (a single proportion, not a history chart). Adaptive keeps
// their natural fill (value against the sensor's own/percent ceiling); Fixed
// scales the fill to a user [min, max] window instead. `text` shows only a
// number and `microbars` renders per-sample without a Y domain, so neither
// takes a range.
const FILL_DESIGNS = new Set<GaugeDesignKey>([
  'waterLevel', 'caterpillar', 'bar', 'fill', 'hbar', 'dotgrid', 'halfgauge',
  'numberfill', 'thermo', 'arc270', 'wedge', 'battery', 'segments', 'dial', 'tickring',
]);

export function designSupportsScale(design: GaugeDesignKey): boolean {
  return SCALABLE_DESIGNS.has(design);
}

export function designIsFill(design: GaugeDesignKey): boolean {
  return FILL_DESIGNS.has(design);
}

// Every design that offers the Range control: the history-scaled ones plus the
// value-fill ones (all but `text` and `microbars`).
export function designSupportsRange(design: GaugeDesignKey): boolean {
  return SCALABLE_DESIGNS.has(design) || FILL_DESIGNS.has(design);
}

// Fill percent for a value-fill gauge against an explicit [min, max] window
// (Fixed range). Clamped to 0-100; the caller passes a validated domain so
// max > min holds.
export function fixedFillPercent(raw: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.max(0, Math.min(100, ((raw - min) / (max - min)) * 100));
}

// Ceilings for the sensor types that do not read 0-100 natively and carry no
// theoreticalMaximum. They are the full-scale value of an Adaptive fill, the
// value colouring's hot end, and the Fixed range's default max.
const CLOCK_FIXED_MAX = 6000;
const GPU_CLOCK_MAX = 3500;
// LHM reports NVIDIA memory clocks at the effective data rate / 2.
const GPU_MEMORY_CLOCK_MAX = 15000;
const FAN_MAX_RPM = 2500;
const PUMP_MAX_RPM = 5000;
// Loop coolant runs far cooler than silicon.
const COOLANT_TEMP_MAX = 60;
const COOLANT_NAME = /coolant|liquid|water/i;
const CPU_POWER_MAX = 300;
const GPU_POWER_MAX = 600;
const PSU_POWER_MAX = 1000;
// A reading above the core ceiling is a supply rail; core voltages (VID,
// Vcore, VCCIO, DIMM VDD, raw Super I/O channels) stay under it. The ceiling
// sits in the gap between the two so no reading straddles it frame to frame.
// Sensor names do not tell the two apart reliably across boards.
const CORE_VOLTAGE_MAX = 2.5;
const RAIL_VOLTAGE_MAX = 15;
// PCIe 4.0 NVMe sequential class, in B/s.
const THROUGHPUT_MAX_BPS = 7_000_000_000;

function fanMax(sensorName?: string): number {
  return sensorName && /pump/i.test(sensorName) ? PUMP_MAX_RPM : FAN_MAX_RPM;
}

function isGpuSensor(device: DeviceKey, sensorName?: string): boolean {
  return device === 'gpu' || device === 'gpu2' || device === 'igpu'
    || (device === 'quick' && sensorName?.startsWith('GPU') === true);
}

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
  'motherboard', 'smart', 'memoryModule', 'battery', 'cooler', 'psu', 'embeddedController',
]);

export function isHeterogeneousTypeDevice(device: DeviceKey): boolean {
  return HETEROGENEOUS_TYPE_DEVICES.has(device);
}

export function staticMaxForDevice(device: DeviceKey, sensorName?: string, sensorType?: string, sensorValue?: number): number {
  if (device === 'fan') return fanMax(sensorName);
  if (device === 'storage') return 100;
  if (device === 'fps') return sensorName === 'Frame Time' ? 50 : 240;
  if (device === 'network') return NETWORK_FIXED_DEFAULT_MAX_BPS;
  switch (sensorType) {
    case 'Fan': return fanMax(sensorName);
    case 'Temperature': return sensorName && COOLANT_NAME.test(sensorName) ? COOLANT_TEMP_MAX : 100;
    case 'Clock':
      if (!isGpuSensor(device, sensorName)) return CLOCK_FIXED_MAX;
      return sensorName?.includes('Memory') ? GPU_MEMORY_CLOCK_MAX : GPU_CLOCK_MAX;
    case 'Voltage':
      return device === 'psu' || device === 'battery' || (sensorValue ?? 0) > CORE_VOLTAGE_MAX ? RAIL_VOLTAGE_MAX : CORE_VOLTAGE_MAX;
    case 'Throughput': return THROUGHPUT_MAX_BPS;
    case 'Power':
      if (device === 'cpu') return CPU_POWER_MAX;
      if (device === 'gpu' || device === 'gpu2') return GPU_POWER_MAX;
      if (device === 'psu') return PSU_POWER_MAX;
      return 100;
    default: return 100;
  }
}

// Ceiling for a slot's Fixed-range upper bound when the user hasn't set an
// override: the sensor's own capacity when it carries one, else the same
// per-device static ceiling the adaptive path falls back to.
export function defaultFixedMax(device: DeviceKey, sensor: HardwareSensor | undefined, nameFallback?: string): number {
  const sMax = sensor?.theoreticalMaximum && sensor.theoreticalMaximum > 0 ? sensor.theoreticalMaximum : 0;
  return sMax || staticMaxForDevice(device, sensor?.name ?? nameFallback, sensor?.type, sensor?.value);
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
    // The user types free values in the settings pane, so a max above the
    // sensor's default ceiling is honored as-is; only an inverted or
    // degenerate range falls back to the sensor default (below). A stale
    // override surviving a device/sensor swap is cleared at the settings
    // layer instead (slot{N}_min/max reset to null on device/sensor change).
    const min = Math.max(0, Number.isFinite(fixedMin) ? (fixedMin as number) : 0);
    const max = Number.isFinite(fixedMax) && (fixedMax as number) > 0 ? (fixedMax as number) : dmax;
    return min < max ? [min, max] : [0, dmax];
  }
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
