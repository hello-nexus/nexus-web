import type { SensorBinding } from '../../../../lib/sensorBinding';
import { makeBlock, type StudioBlock, type StudioRecipe } from './studioCompiler';

// The "Sensor" category's built-in effects. Each is a Studio recipe, so it is also a
// Studio starter, and its baked shader ships with the service under `key`. Block uids
// are fixed: the uniform names (`u_<uid>_<param>`) are what the built-in effect
// definitions in types/lighting.ts and the service's default presets refer to.

type Rgb = [number, number, number];

const GREEN: Rgb = [0.1, 1, 0.4];
const YELLOW: Rgb = [1, 0.85, 0.1];
const RED: Rgb = [1, 0.15, 0.1];
const CYAN: Rgb = [0.1, 0.8, 1];
const BLUE: Rgb = [0.2, 0.4, 1];
const VIOLET: Rgb = [0.7, 0.3, 1];
const TEAL: Rgb = [0.2, 1, 0.9];
const DEEP: Rgb = [0, 0.45, 1];

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

const round = (n: number, places: number) => Number(n.toFixed(places));

/**
 * A color block whose gradient runs across the brightness range [lo, 1] of a fill
 * pattern, so the lit part wears the stops from the base outward. Two stops end on
 * the second, three on the third. The base hue offset realigns the start.
 */
function ramp(stops: readonly Rgb[], lo: number): { colors: StudioBlock; hue: number } {
  const [a, b, c = b] = stops;
  const reach = stops.length > 2 ? 2 / 3 : 1 / 3;
  const spread = reach / (1 - lo);
  const hue = (((-lo * spread) % 1) + 1) % 1;
  return { colors: block('col', 'colors', { spread: round(spread, 4), shade: 1 }, { c1: a, c2: b, c3: c }), hue: round(hue, 4) };
}

function fill(
  type: string, lo: number, stops: readonly Rgb[], binding: SensorBinding,
  params: Record<string, number>, knobs: string[],
): StudioRecipe {
  const { colors, hue } = ramp(stops, lo);
  const pattern = sensorLevel(block('fill', type, { level: 0, ...params }), 'level', binding);
  return {
    v: 1, blocks: [pattern, colors], speed: 50, hue, saturation: 1, contrast: 1,
    knobs: knobs.map(key => ({ uid: 'fill', key })),
  };
}

export const SENSOR_PREMADES: readonly SensorPremade[] = [
  {
    key: 'sensorbar',
    starterId: 'sensorBar',
    build: () => fill('fillbar', 0.55, [GREEN, YELLOW, RED], quick('summary/cpu-usage', 0, 100), {}, ['angle', 'flip']),
  },
  {
    key: 'sensorclock',
    starterId: 'sensorClock',
    build: () => fill('fillclock', 0.55, [CYAN, YELLOW, RED], quick('summary/cpu-temp', 30, 95), {}, ['angle', 'flip']),
  },
  {
    key: 'sensorsegments',
    starterId: 'sensorSegments',
    build: () => fill('fillsegments', 0.5, [CYAN, VIOLET], quick('summary/memory-usage', 0, 100), { count: 10 }, ['angle', 'flip', 'count']),
  },
  {
    key: 'sensorliquid',
    starterId: 'sensorLiquid',
    build: () => fill('fillliquid', 0.5, [DEEP, TEAL], quick('summary/memory-usage', 0, 100), {}, ['angle', 'flip', 'wave']),
  },
  {
    key: 'sensorcenter',
    starterId: 'sensorCenter',
    build: () => fill('fillcenter', 0.55, [BLUE, YELLOW, RED], quick('summary/gpu-temp', 30, 90), {}, ['angle', 'flip']),
  },
  {
    key: 'sensorgauge',
    starterId: 'sensorGauge',
    build: () => fill('fillgauge', 0.55, [GREEN, YELLOW, RED], quick('summary/gpu-usage', 0, 100), {}, ['angle', 'flip', 'span']),
  },
  {
    // The whole display wears one color that moves from blue through yellow to red as the CPU heats up.
    key: 'sensorshift',
    starterId: 'sensorShift',
    build: () => {
      const colors = block('col', 'colors', { spread: 0, shade: 0 }, { c1: BLUE, c2: YELLOW, c3: RED });
      // Spread 0 to 2/3 walks the three stops once; the param spans 0 to 3, so the full-range amount is 2/9.
      sensorLevel(colors, 'spread', quick('summary/cpu-temp', 30, 90), round(2 / 9, 4));
      return { v: 1, blocks: [block('solid', 'solid'), colors], speed: 50, hue: 0, saturation: 1, contrast: 1 };
    },
  },
  {
    // The same walk spread across the display, so heat reaches the far side only as the CPU gets hotter.
    key: 'sensorheat',
    starterId: 'sensorHeat',
    build: () => {
      const colors = block('col', 'colors', { spread: 0, shade: 0 }, { c1: BLUE, c2: YELLOW, c3: RED });
      sensorLevel(colors, 'spread', quick('summary/cpu-temp', 30, 90), round(2 / 9, 4));
      const field = block('grad', 'gradient', { angle: 90, spread: 1, speed: 0 });
      return {
        v: 1, blocks: [field, colors], speed: 50, hue: 0, saturation: 1, contrast: 1,
        knobs: [{ uid: 'grad', key: 'angle' }],
      };
    },
  },
];
