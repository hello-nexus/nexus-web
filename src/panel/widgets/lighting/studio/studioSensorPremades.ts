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
// Heat: blue through teal and yellow to red.
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

function ramp(stops: Stops, low: number, params: Record<string, number> = {}): StudioBlock {
  return block('col', 'ramp', { low, ...params }, { c1: stops[0], c2: stops[1], c3: stops[2], c4: stops[3] });
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
    key: 'sensorgauge',
    starterId: 'sensorGauge',
    build: () => fill('fillgauge', 0.55, LOAD, quick('summary/gpu-usage', 0, 100), {}, ['angle', 'flip', 'span']),
  },
  {
    // The whole display wears one color that walks from blue through yellow to red as the CPU heats up.
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
