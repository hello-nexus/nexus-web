import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSensorUniforms } from '../../../../lib/sensorBinding';
import { parseShaderParams } from '../../../../lib/shaderParams';
import { EFFECTS, categoryOf } from '../../../../types/lighting';
import { STUDIO_COST_BUDGET } from './studioBlocks';
import { compileStudio, recipeCost } from './studioCompiler';
import { isRecipe, parseMarketRecipe } from './studioLibrary';
import { SENSOR_PREMADES } from './studioSensorPremades';
import { STUDIO_STARTERS } from './studioRecipes';

// The service ships each premade's baked shader under its key, so a premade's GLSL must
// not drift: a change here is a change to a file the service carries. Re-bake and update
// the pin together (SENSOR_PREMADE_WRITE=1 rewrites the pins), and ship the new frags.
// SENSOR_FRAGS_DIR=<dir> writes <key>.frag for each premade.

const FIXTURE = resolve(__dirname, 'studioSensorPremades.fixture.json');
const pins: Record<string, string> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
const bake = (key: string) => compileStudio(SENSOR_PREMADES.find(p => p.key === key)!.build(), { bake: true });
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('sensor premades', () => {
  it('writes the baked frags and pins when asked', () => {
    const dir = process.env.SENSOR_FRAGS_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      for (const p of SENSOR_PREMADES) writeFileSync(resolve(dir, `${p.key}.frag`), bake(p.key).frag);
    }
    if (process.env.SENSOR_PREMADE_WRITE === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify(Object.fromEntries(SENSOR_PREMADES.map(p => [p.key, sha(bake(p.key).frag)])), null, 2)}\n`);
    }
    expect(true).toBe(true);
  });

  it.each(SENSOR_PREMADES.map(p => p.key))('%s bakes to the pinned GLSL', key => {
    expect(sha(bake(key).frag)).toBe(pins[key]);
  });

  it.each(SENSOR_PREMADES.map(p => [p.key]))('%s is a valid, installable recipe', key => {
    const recipe = SENSOR_PREMADES.find(p => p.key === key)!.build();
    expect(isRecipe(recipe)).toBe(true);
    expect(parseMarketRecipe(recipe)).not.toBeNull();
    expect(recipeCost(recipe)).toBeLessThanOrEqual(STUDIO_COST_BUDGET);
  });

  it.each(SENSOR_PREMADES.map(p => p.key))('%s is ASCII with one default per sensor uniform', key => {
    const { frag, sensors } = bake(key);
    // eslint-disable-next-line no-control-regex
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(frag)).toBe(true);
    expect(sensors.length).toBeGreaterThan(0);
    expect(parseSensorUniforms(frag)).toEqual(sensors);
    for (const s of sensors) expect(frag.match(new RegExp(`uniform float ${s.name};`, 'g'))).toHaveLength(1);
    // A sensor uniform is not a slider.
    expect(parseShaderParams(frag).some(p => sensors.some(s => s.name === p.name))).toBe(false);
  });

  it.each(SENSOR_PREMADES.map(p => p.key))('%s has a built-in definition whose uniforms exist in the shader', key => {
    const def = EFFECTS.find(e => e.key === key);
    expect(def, 'a Sensor-category built-in effect').toBeDefined();
    expect(categoryOf(key)).toBe('sensor');
    const { frag, sensors } = bake(key);
    const declared = new Set(parseShaderParams(frag).map(p => p.name));
    for (const p of def!.params) expect(declared.has(p.name), p.name).toBe(true);
    expect((def!.sensors ?? []).map(s => s.name).sort()).toEqual(sensors.map(s => s.name).sort());
  });

  it('offers every premade as a Studio starter and a Sensor effect key prefixed sensor', () => {
    for (const p of SENSOR_PREMADES) {
      expect(p.key.startsWith('sensor')).toBe(true);
      expect(STUDIO_STARTERS.some(s => s.id === p.starterId)).toBe(true);
    }
    expect(EFFECTS.filter(e => categoryOf(e.key) === 'sensor').map(e => e.key).sort())
      .toEqual(SENSOR_PREMADES.map(p => p.key).sort());
  });

  it('gives every geometric premade a rotation and flip control', () => {
    for (const p of SENSOR_PREMADES.filter(x => x.key !== 'sensorshift')) {
      const names = EFFECTS.find(e => e.key === p.key)!.params.map(q => q.name);
      expect(names.some(n => n.endsWith('_angle')), p.key).toBe(true);
    }
    for (const key of ['sensorbar', 'sensorclock', 'sensorsegments', 'sensorliquid', 'sensorcenter', 'sensorgauge']) {
      expect(EFFECTS.find(e => e.key === key)!.params.some(q => q.name.endsWith('_flip')), key).toBe(true);
    }
  });
});
