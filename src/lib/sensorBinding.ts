// A sensor-driven shader uniform: which hardware reading feeds it and what
// range of that reading maps to 0..1. The frag annotation is the author's
// default; EffectState.sensors holds the user's per-uniform override.

export interface SensorBinding {
  /** DeviceKey vocabulary of the monitoring pickers. */
  category: string;
  /** Concrete HardwareSensor.id (or the sensor name for network and fps). */
  sensor: string;
  /** Reading that maps to 0, in the sensor's own units. */
  min: number;
  /** Reading that maps to 1, in the sensor's own units. */
  max: number;
}

/** A uniform the annotation marks as sensor-fed, with the author's default binding. */
export interface SensorUniform {
  name: string;
  binding: SensorBinding;
}

/** Resolves a binding to its smoothed-or-raw 0..1 signal; null while the sensor is unavailable. */
export type SensorSignal = (binding: SensorBinding) => number | null;

export const DEFAULT_SENSOR_BINDING: SensorBinding = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };

const CATEGORY_RE = /^[a-zA-Z0-9]{1,24}$/;
// Sensor ids reach a GLSL comment and the service, so the alphabet stays small and quote-free.
const SENSOR_RE = /^[\w\-./:()%#+ ]{1,96}$/;
const LIMIT = 1e9;

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

export function isSensorBinding(x: unknown): x is SensorBinding {
  if (!isObj(x)) return false;
  const { category, sensor, min, max } = x;
  return typeof category === 'string' && CATEGORY_RE.test(category)
    && typeof sensor === 'string' && SENSOR_RE.test(sensor)
    && typeof min === 'number' && typeof max === 'number'
    && Number.isFinite(min) && Number.isFinite(max)
    && Math.abs(min) <= LIMIT && Math.abs(max) <= LIMIT && min < max;
}

/** Fields in the contract's order, so equal bindings serialize identically. */
export function cleanBinding(b: SensorBinding): SensorBinding {
  return { category: b.category, sensor: b.sensor, min: b.min, max: b.max };
}

export function sensorBindingsEqual(a: SensorBinding | undefined, b: SensorBinding | undefined): boolean {
  if (!a || !b) return a === b;
  return a.category === b.category && a.sensor === b.sensor
    && Math.abs(a.min - b.min) < 1e-9 && Math.abs(a.max - b.max) < 1e-9;
}

/** Two override maps are the same when each side binds the same uniforms the same way; absent equals empty. */
export function sensorOverridesEqual(a: Record<string, SensorBinding> | undefined, b: Record<string, SensorBinding> | undefined): boolean {
  const ka = Object.keys(a ?? {});
  const kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  return ka.every(k => sensorBindingsEqual(a?.[k], b?.[k]));
}

/** Single-line JSON with every non-ASCII character escaped, as a baked frag must be ASCII. */
export function sensorAnnotationJson(b: SensorBinding): string {
  return JSON.stringify(cleanBinding(b)).replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const SENSOR_LINE_RE = /^\s*uniform\s+float\s+(u_\w+)\s*;\s*\/\/\s*sensor\s+(\{.*\})\s*$/;

/** The sensor uniforms a composed shader declares, in source order, with the author's default binding. */
export function parseSensorUniforms(frag: string): SensorUniform[] {
  const out: SensorUniform[] = [];
  for (const line of frag.split('\n')) {
    const m = SENSOR_LINE_RE.exec(line);
    if (!m) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[2]);
    } catch {
      continue;
    }
    if (isSensorBinding(parsed)) out.push({ name: m[1], binding: cleanBinding(parsed) });
  }
  return out;
}

/** The binding a uniform renders with: the user's override when it is a valid one, else the author's default. */
export function effectiveBinding(
  uniform: SensorUniform,
  overrides: Record<string, SensorBinding> | undefined,
): SensorBinding {
  const o = overrides?.[uniform.name];
  return isSensorBinding(o) ? o : uniform.binding;
}

/** Reading to 0..1 over the binding's range; a missing or non-finite reading is 0. */
export function normalizeSensor(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

const SWEEP_PERIOD_S = 8;

/** A slow 0..1 swing, standing in for a sensor that is unavailable in a preview. */
export function sensorSweep(seconds: number): number {
  return 0.5 - 0.5 * Math.cos((seconds * 2 * Math.PI) / SWEEP_PERIOD_S);
}

/** Time constant of the glide toward a new reading; the service uses the same so previews match the LEDs. */
export const SENSOR_SMOOTHING_S = 0.4;

/** One smoothing step toward `target` after `dt` seconds. */
export function smoothSensor(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / SENSOR_SMOOTHING_S));
}
