import type { SensorBinding } from '../../../../lib/sensorBinding';
import { makeBlock, type StudioBlock, type StudioRecipe } from './studioCompiler';

// The "Sensor reactive" category's built-in effects. Each is a Studio recipe, so it is also a
// Studio starter, and its baked shader ships with the service under `key`. Block uids
// are fixed: the uniform names (`u_<uid>_<param>`) are what the built-in effect
// definitions in types/lighting.ts and the service's default presets refer to.

// Colors come from the Lighting page's color wheel: each premade runs a 0 to 1 field along its design (the
// fill, the level, the heat) and the wheel's range colors it, the wheel's hue being the middle of the range and
// its width the span, a single color when collapsed. The field's start takes the range's high hue, its end the
// low one, so the default ranges read cool to hot.

export interface SensorPremade {
  /** Built-in effect key, also the baked shader's file name. */
  key: string;
  /** Studio starter id (its label is lighting.studio.starter.<starterId>). */
  starterId: string;
  /** The baked effect: the wheel state arrives from the preset, so its own base is neutral. */
  build: () => StudioRecipe;
  /** The four default presets, as the effect-state fields the service stores for each slot. */
  presets: readonly SensorPreset[];
}

export interface SensorPreset {
  name: string;
  /** Wheel hue (the middle of the range), 0 to 1. */
  hue: number;
  /** Wheel colorize: 1 less the range's share of the wheel, so 1 is a single color. */
  colorize: number;
  saturation: number;
  contrast: number;
  speed: number;
  intensity: number;
  params: Record<string, number>;
}

/** A range given by its start (field 0) and end (field 1) hue, in turns of the wheel, start above end. */
function range(name: string, from: number, to: number, params: Record<string, number> = {}): SensorPreset {
  const span = from - to;
  const mid = (from + to) / 2;
  return {
    name, hue: Number((((mid % 1) + 1) % 1).toFixed(3)), colorize: Number((1 - span).toFixed(3)),
    saturation: 1, contrast: 1, speed: 50, intensity: 1, params,
  };
}

const COOL_HOT = range('Cool to hot', 0.62, 0);
const OCEAN = range('Ocean', 0.62, 0.46);
const SUNSET = range('Sunset', 0.14, -0.08);
const AURORA = range('Aurora', 0.78, 0.38);
const GREEN_RED = range('Green to red', 0.33, 0);
const CANDY = range('Candy', 1.02, 0.78);

const quick = (sensor: string, min: number, max: number): SensorBinding => ({ category: 'quick', sensor, min, max });

function block(uid: string, type: string, params: Record<string, number> = {}): StudioBlock {
  const b = makeBlock(type);
  b.uid = uid;
  Object.assign(b.params, params);
  return b;
}

function sensorLevel(b: StudioBlock, key: string, binding: SensorBinding, amount = 1): StudioBlock {
  b.mods = { ...b.mods, [key]: { source: 'sensor', amount, sensor: binding } };
  return b;
}

/** The wheel-colored field: it runs from `low` to 1 and the wheel's range colors it. */
function wheel(low: number, params: Record<string, number> = {}): StudioBlock {
  return block('col', 'wheelcolor', { low, ...params });
}

/** A fill meter: `type` filling to a sensor-driven level, its brightness running from `low` at the base to 1. */
function fill(type: string, low: number, binding: SensorBinding, params: Record<string, number>, knobs: string[]): StudioRecipe {
  const pattern = sensorLevel(block('fill', type, { level: 0, ...params }), 'level', binding);
  return {
    v: 1, blocks: [pattern, wheel(low)], speed: 50, hue: 0, saturation: 1, contrast: 1,
    knobs: knobs.map(key => ({ uid: 'fill', key })),
  };
}

const withParams = (p: SensorPreset, params: Record<string, number>): SensorPreset => ({ ...p, params });

export const SENSOR_PREMADES: readonly SensorPremade[] = [
  {
    key: 'sensorbar',
    starterId: 'sensorBar',
    build: () => fill('fillbar', 0.55, quick('summary/cpu-usage', 0, 100), {}, ['angle', 'flip']),
    presets: [GREEN_RED, COOL_HOT, SUNSET, AURORA],
  },
  {
    key: 'sensorclock',
    starterId: 'sensorClock',
    build: () => fill('fillclock', 0.55, quick('summary/cpu-temp', 30, 95), {}, ['angle', 'flip']),
    presets: [COOL_HOT, SUNSET, OCEAN, AURORA],
  },
  {
    key: 'sensorsegments',
    starterId: 'sensorSegments',
    build: () => fill('fillsegments', 0.5, quick('summary/memory-usage', 0, 100), { count: 10 }, ['angle', 'flip', 'count']),
    presets: [
      withParams(OCEAN, { u_fill_count: 10 }), withParams(AURORA, { u_fill_count: 8 }),
      withParams(CANDY, { u_fill_count: 14 }), withParams(SUNSET, { u_fill_count: 12 }),
    ],
  },
  {
    key: 'sensorliquid',
    starterId: 'sensorLiquid',
    build: () => fill('fillliquid', 0.5, quick('summary/memory-usage', 0, 100), {}, ['angle', 'flip', 'wave']),
    presets: [
      withParams(OCEAN, { u_fill_wave: 0.6 }), withParams(AURORA, { u_fill_wave: 0.9 }),
      withParams(CANDY, { u_fill_wave: 0.3 }), withParams(SUNSET, { u_fill_wave: 0.6 }),
    ],
  },
  {
    key: 'sensorcenter',
    starterId: 'sensorCenter',
    build: () => fill('fillcenter', 0.55, quick('summary/gpu-temp', 30, 90), {}, ['angle', 'flip']),
    presets: [COOL_HOT, SUNSET, AURORA, OCEAN],
  },
  {
    // The whole display wears one color that walks the wheel's range across the sensor's range.
    key: 'sensorshift',
    starterId: 'sensorShift',
    build: () => {
      const level = sensorLevel(block('hot', 'solid', { level: 0 }), 'level', quick('summary/cpu-temp', 30, 90));
      return { v: 1, blocks: [level, wheel(0, { shade: 0 })], speed: 50, hue: 0, saturation: 1, contrast: 1 };
    },
    presets: [COOL_HOT, GREEN_RED, SUNSET, AURORA],
  },
  {
    // The same walk laid across the display: the far edge colors first and the rest follows as the sensor rises.
    key: 'sensorheat',
    starterId: 'sensorHeat',
    build: () => {
      const field = block('grad', 'gradient', { angle: 90, spread: 1, speed: 0 });
      // The field starts high, so only the far edge is colored; a falling start brings the rest of the display in.
      const colors = sensorLevel(wheel(0.95, { shade: 0 }), 'low', quick('summary/cpu-temp', 30, 90), -1);
      return {
        v: 1, blocks: [field, colors], speed: 50, hue: 0, saturation: 1, contrast: 1,
        knobs: [{ uid: 'grad', key: 'angle' }],
      };
    },
    presets: [SUNSET, COOL_HOT, AURORA, OCEAN],
  },
];

/** The Studio starter: the same blocks, opening on the first preset's wheel instead of a neutral one. */
export function starterRecipe(p: SensorPremade): StudioRecipe {
  const first = p.presets[0];
  return { ...p.build(), hue: first.hue, colorize: first.colorize };
}
