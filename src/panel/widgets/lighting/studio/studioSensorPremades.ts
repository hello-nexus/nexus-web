import type { SensorBinding } from '../../../../lib/sensorBinding';
import { makeBlock, type StudioBlock, type StudioRecipe } from './studioCompiler';

// The "Sensor" category's built-in effects. Each is a Studio recipe, so it is also a
// Studio starter, and its baked shader ships with the service under `key`. Block uids
// are fixed: the uniform names (`u_<uid>_<param>`) are what the built-in effect
// definitions in types/lighting.ts and the service's default presets refer to.

type Rgb = [number, number, number];

type Stops = readonly [Rgb, Rgb, Rgb, Rgb];

// Load: green through lime and amber to red.
const LOAD: Stops = [[0.1, 1, 0.4], [0.6, 1, 0.2], [1, 0.85, 0.1], [1, 0.15, 0.1]];
// Heat: blue through teal and yellow to red (the default wheel colors).
const HEAT: Stops = [[0.15, 0.35, 1], [0.1, 0.95, 0.55], [1, 0.85, 0.1], [1, 0.15, 0.1]];
const MEMORY: Stops = [[0.1, 0.8, 1], [0.4, 0.5, 1], [0.7, 0.3, 1], [1, 0.3, 0.8]];
const WATER: Stops = [[0, 0.3, 0.8], [0.05, 0.6, 1], [0.2, 1, 0.9], [0.8, 1, 0.95]];

export interface SensorPremade {
  /** Built-in effect key, also the baked shader's file name. */
  key: string;
  /** Studio starter id (its label is lighting.studio.starter.<starterId>). */
  starterId: string;
  build: () => StudioRecipe;
}

const quick = (sensor: string, min: number, max: number): SensorBinding => ({ category: 'quick', sensor, min, max });

function block(uid: string, type: string, params: Record<string, number> = {}, colors?: Record<string, Rgb>): StudioBlock {
  const b = makeBlock(type);
  b.uid = uid;
  Object.assign(b.params, params);
  if (colors) b.colors = { ...b.colors, ...colors };
  return b;
}

function sensorLevel(b: StudioBlock, key: string, binding: SensorBinding, amount = 1): StudioBlock {
  b.mods = { ...b.mods, [key]: { source: 'sensor', amount, sensor: binding } };
  return b;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const places = (n: number) => Number(n.toFixed(2));

/** Hue, saturation and brightness of an RGB color, each 0 to 1: the wheel's own terms. */
function toHsv([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [places(h / 6), places(max === 0 ? 0 : d / max), places(max)];
}

/** The ramp whose four colors the Lighting page's color wheel picks, starting at the given stops. */
function ramp(stops: Stops, low: number, params: Record<string, number> = {}): StudioBlock {
  const colorParams: Record<string, number> = {};
  stops.forEach((rgb, i) => {
    const [h, s, v] = toHsv(rgb);
    const id = 'abcd'[i];
    colorParams[`${id}Hue`] = h;
    colorParams[`${id}Sat`] = clamp01(s);
    colorParams[`${id}Val`] = clamp01(v);
  });
  return block('col', 'wheelramp', { low, ...colorParams, ...params });
}

/** A fill meter: `type` filling to a sensor-driven level, its brightness running from `low` at the base to 1. */
function fill(type: string, low: number, stops: Stops, binding: SensorBinding, params: Record<string, number>, knobs: string[]): StudioRecipe {
  const pattern = sensorLevel(block('fill', type, { level: 0, ...params }), 'level', binding);
  return {
    v: 1, blocks: [pattern, ramp(stops, low)], speed: 50, hue: 0, saturation: 1, contrast: 1,
    knobs: knobs.map(key => ({ uid: 'fill', key })),
  };
}

export const SENSOR_PREMADES: readonly SensorPremade[] = [
  {
    key: 'sensorbar',
    starterId: 'sensorBar',
    build: () => fill('fillbar', 0.55, LOAD, quick('summary/cpu-usage', 0, 100), {}, ['angle', 'flip']),
  },
  {
    key: 'sensorclock',
    starterId: 'sensorClock',
    build: () => fill('fillclock', 0.55, HEAT, quick('summary/cpu-temp', 30, 95), {}, ['angle', 'flip']),
  },
  {
    key: 'sensorsegments',
    starterId: 'sensorSegments',
    build: () => fill('fillsegments', 0.5, MEMORY, quick('summary/memory-usage', 0, 100), { count: 10 }, ['angle', 'flip', 'count']),
  },
  {
    key: 'sensorliquid',
    starterId: 'sensorLiquid',
    build: () => fill('fillliquid', 0.5, WATER, quick('summary/memory-usage', 0, 100), {}, ['angle', 'flip', 'wave']),
  },
  {
    key: 'sensorcenter',
    starterId: 'sensorCenter',
    build: () => fill('fillcenter', 0.55, HEAT, quick('summary/gpu-temp', 30, 90), {}, ['angle', 'flip']),
  },
  {
    // The whole display wears one color that walks the wheel's four colors, first to last, across the sensor's range.
    key: 'sensorshift',
    starterId: 'sensorShift',
    build: () => {
      const level = sensorLevel(block('hot', 'solid', { level: 0 }), 'level', quick('summary/cpu-temp', 30, 90));
      return { v: 1, blocks: [level, ramp(HEAT, 0, { shade: 0 })], speed: 50, hue: 0, saturation: 1, contrast: 1 };
    },
  },
  {
    // The same walk laid across the display: heat enters from the bottom and spreads up as the CPU gets hotter.
    key: 'sensorheat',
    starterId: 'sensorHeat',
    build: () => {
      const field = block('grad', 'gradient', { angle: 90, spread: 1, speed: 0 });
      // The ramp starts high, so only the far edge is hot; a falling start brings the rest of the display in.
      const colors = sensorLevel(ramp(HEAT, 0.95, { shade: 0 }), 'low', quick('summary/cpu-temp', 30, 90), -1);
      return {
        v: 1, blocks: [field, colors], speed: 50, hue: 0, saturation: 1, contrast: 1,
        knobs: [{ uid: 'grad', key: 'angle' }],
      };
    },
  },
];
