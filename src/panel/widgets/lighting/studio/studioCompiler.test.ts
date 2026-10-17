import { describe, expect, it } from 'vitest';
import { DEFAULT_SENSOR_BINDING, parseSensorUniforms } from '../../../../lib/sensorBinding';
import { parseShaderParams } from '../../../../lib/shaderParams';
import { STUDIO_BLOCKS, STUDIO_COST_BUDGET, STUDIO_STAGES, STUDIO_STAGE_LIMIT, studioBlock } from './studioBlocks';
import { compileStudio, makeBlock, orderedBlocks, recipeCost, recipeUsesAudio, recipeUsesSensors, stageCount, staleParamsBetween, studioUniform, type StudioRecipe } from './studioCompiler';
import { STUDIO_STARTERS, mutateRecipe, randomRecipe } from './studioRecipes';
import { SENSOR_PREMADES } from './studioSensorPremades';

const recipeOf = (...types: string[]): StudioRecipe => ({
  v: 1, blocks: types.map(makeBlock), speed: 50, hue: 0, saturation: 1, contrast: 1,
});

function expectValid(r: StudioRecipe) {
  expect(stageCount(r, 'color')).toBe(1);
  expect(stageCount(r, 'pattern')).toBeGreaterThanOrEqual(1);
  expect(recipeCost(r)).toBeLessThanOrEqual(STUDIO_COST_BUDGET);
  for (const stage of STUDIO_STAGES) expect(stageCount(r, stage)).toBeLessThanOrEqual(STUDIO_STAGE_LIMIT[stage]);
}

describe('compileStudio', () => {
  it('declares a hint_range spec for every param value it emits, with the value in range', () => {
    for (const def of STUDIO_BLOCKS) {
      const types = def.stage === 'pattern' ? ['rings', def.type, 'palette'] : def.stage === 'color' ? ['plasma', def.type] : ['plasma', def.type, 'palette'];
      const { frag, params } = compileStudio(recipeOf(...types));
      const specs = new Map(parseShaderParams(frag).map(s => [s.name, s]));
      for (const [name, value] of Object.entries(params)) {
        const spec = specs.get(name);
        expect(spec?.declared, `${def.type}: ${name}`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(spec!.min);
        expect(value).toBeLessThanOrEqual(spec!.max);
      }
      expect(frag).not.toMatch(/\$[a-z]/);
    }
  });

  // Mac desktop GL rejects non-ASCII anywhere in the source, comments included.
  it('emits ASCII-only GLSL', () => {
    const all = recipeOf('warp', 'kaleidoscope', 'cells', 'sparkle', 'contour', 'colors', 'grain');
    expect(compileStudio(all).frag).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('keeps the shader key when only param values change', () => {
    const r = recipeOf('plasma', 'palette');
    const a = compileStudio(r);
    r.blocks[0].params.scale = 5;
    const b = compileStudio(r);
    expect(b.key).toBe(a.key);
    expect(b.params[studioUniform(r.blocks[0].uid, 0, 'scale')]).toBe(5);
  });

  it('changes the key and routes the audio uniform when a param is modulated', () => {
    const r = recipeOf('plasma', 'palette');
    const before = compileStudio(r).key;
    r.blocks[0].mods = { scale: { source: 'beat', amount: -0.25 } };
    const compiled = compileStudio(r);
    const u = studioUniform(r.blocks[0].uid, 0, 'scale');
    expect(compiled.key).not.toBe(before);
    expect(compiled.params[`${u}_m`]).toBe(-0.25);
    expect(compiled.frag).toContain(`${u}_m * 5.7 * u_audioBeat`);
  });

  it('drives a wave from effect time at its rate, needing no audio', () => {
    const r = recipeOf('plasma', 'palette');
    r.blocks[0].mods = { scale: { source: 'triangle', amount: 0.5, rate: 2 } };
    const compiled = compileStudio(r);
    const u = studioUniform(r.blocks[0].uid, 0, 'scale');
    expect(compiled.params[`${u}_r`]).toBe(2);
    expect(compiled.frag).toContain(`fract((t * ${u}_r))`);
    expect(compiled.frag).not.toMatch(/uniform float u_audio/);
  });

  it('gives each random wave its own sequence', () => {
    const r = recipeOf('plasma', 'palette');
    r.blocks[0].mods = { scale: { source: 'random', amount: 0.5, rate: 1 }, speed: { source: 'random', amount: 0.5, rate: 1 } };
    const seeds = [...compileStudio(r).frag.matchAll(/hash21\(vec2\(floor\([^)]*\)\), ([\d.]+)\)\)/g)].map(m => m[1]);
    expect(seeds).toHaveLength(2);
    expect(new Set(seeds).size).toBe(2);
  });

  it('gates a music mod only when a threshold is set', () => {
    const r = recipeOf('plasma', 'palette');
    r.blocks[0].mods = { scale: { source: 'bass', amount: 0.5 } };
    const u = studioUniform(r.blocks[0].uid, 0, 'scale');
    expect(compileStudio(r).frag).not.toContain(`${u}_g`);
    r.blocks[0].mods = { scale: { source: 'bass', amount: 0.5, gate: 0.25 } };
    const compiled = compileStudio(r);
    expect(compiled.params[`${u}_g`]).toBe(0.25);
    expect(compiled.frag).toContain(`clamp((u_audioBass - ${u}_g) / (1.0 - ${u}_g), 0.0, 1.0)`);
  });

  it('declares the audio a visualizer block reads, the spectrum as its 16 bands', () => {
    const frag = compileStudio(recipeOf('spectrum', 'palette')).frag;
    expect(frag).toContain('uniform float u_spectrum[16];');
    expect(compileStudio(recipeOf('beatrings', 'palette')).frag).toContain('uniform float u_audioBeat;');
    expect(compileStudio(recipeOf('rings', 'palette')).frag).not.toMatch(/u_spectrum|u_audio/);
  });

  it('counts a recipe as reading the music for a visualizer block or a music mod, not a wave', () => {
    expect(recipeUsesAudio(recipeOf('vu', 'palette'))).toBe(true);
    const r = recipeOf('plasma', 'palette');
    r.blocks[0].mods = { scale: { source: 'sine', amount: 0.5, rate: 1 } };
    expect(recipeUsesAudio(r)).toBe(false);
    r.blocks[0].mods = { scale: { source: 'mid', amount: 0.5 } };
    expect(recipeUsesAudio(r)).toBe(true);
  });

  it('rounds a modulated whole-number param so it never lands between integers', () => {
    const r = recipeOf('kaleidoscope', 'rings', 'palette');
    r.blocks[0].mods = { sides: { source: 'bass', amount: 0.5 } };
    const u = studioUniform(r.blocks[0].uid, 0, 'sides');
    expect(compileStudio(r).frag).toContain(`floor(clamp(${u} + ${u}_m * 14.0 * u_audioBass, 2.0, 16.0) + 0.5)`);
  });

  it('clamps out-of-range and non-finite values to the authored range', () => {
    const r = recipeOf('rings', 'palette');
    r.blocks[0].params.count = 999;
    r.blocks[0].params.speed = Number.NaN;
    const { params } = compileStudio(r);
    const uid = r.blocks[0].uid;
    expect(params[studioUniform(uid, 0, 'count')]).toBe(40);
    expect(params[studioUniform(uid, 0, 'speed')]).toBe(1);
  });

  it('orders blocks by stage whatever the array order', () => {
    const r = recipeOf('glow', 'palette', 'rings', 'spin');
    expect(orderedBlocks(r).map(b => studioBlock(b.type)!.stage)).toEqual(['space', 'pattern', 'color', 'finish']);
  });

  it('blends only the second and later patterns', () => {
    const r = recipeOf('rings', 'stripes', 'palette');
    const { frag } = compileStudio(r);
    const [first, second] = r.blocks;
    expect(frag).toContain('v = f;');
    expect(frag).toContain(`v = blendV(v, f, ${studioUniform(second.uid, 1, 'blend')}, ${studioUniform(second.uid, 1, 'mix')});`);
    expect(frag).not.toContain(studioUniform(first.uid, 0, 'blend'));
  });

  it('keeps a param\'s uniform name when its block moves', () => {
    const r = recipeOf('spin', 'zoom', 'plasma', 'palette');
    const zoom = r.blocks[1];
    const before = studioUniform(zoom.uid, 1, 'scale');
    const moved = { ...r, blocks: [r.blocks[1], r.blocks[0], ...r.blocks.slice(2)] };
    expect(Object.keys(compileStudio(moved).params)).toContain(before);
  });

  // The saved shader must reproduce the recipe under a neutral EffectState.
  it('bakes recipe values as defaults and base adjustments as constants', () => {
    const r = { ...recipeOf('rings', 'palette'), speed: 25, hue: 0.4, saturation: 1.5, contrast: 0.8 };
    r.blocks[0].params.count = 12.5;
    const baked = compileStudio(r, { bake: true });
    const specs = new Map(parseShaderParams(baked.frag).map(s => [s.name, s]));
    expect(specs.get(studioUniform(r.blocks[0].uid, 0, 'count'))?.defaultValue).toBe(12.5);
    expect(baked.frag).toContain('const float S_SPEED = 0.5;');
    expect(baked.frag).toContain('const float S_HUE = 0.4;');
    expect(baked.frag).toContain('const float S_SAT = 1.5;');
    expect(baked.frag).toContain('const float S_CON = 0.8;');
    const live = compileStudio(r);
    expect(live.frag).toContain('const float S_SPEED = 1.0;');
    expect(new Map(parseShaderParams(live.frag).map(s => [s.name, s])).get(studioUniform(r.blocks[0].uid, 0, 'count'))?.defaultValue).toBe(8);
  });
});

describe('studio recipes', () => {
  it('builds valid starters', () => {
    for (const s of STUDIO_STARTERS) expectValid(s.build());
  });

  it('randomizes and mutates into valid recipes', () => {
    for (let i = 0; i < 300; i++) {
      const r = randomRecipe();
      expectValid(r);
      expectValid(mutateRecipe(r));
    }
  });
});

describe('staleParamsBetween', () => {
  it('lists only params whose saved value changed, disappeared, or lost their pin', () => {
    const before = recipeOf('rings', 'stripes', 'palette');
    const [rings, stripes] = before.blocks;
    before.knobs = [{ uid: rings.uid, key: 'speed' }, { uid: rings.uid, key: 'count' }];
    const after: StudioRecipe = structuredClone(before);
    after.blocks[0].params.count = 20;
    after.blocks = after.blocks.filter(b => b.uid !== stripes.uid);
    after.knobs = [{ uid: rings.uid, key: 'count' }];
    const stale = staleParamsBetween(before, after);
    expect(stale).toContain(studioUniform(rings.uid, 0, 'count'));
    expect(stale).toContain(studioUniform(rings.uid, 0, 'speed'));
    expect(stale).toContain(studioUniform(stripes.uid, 1, 'angle'));
    expect(stale).not.toContain(studioUniform(after.blocks[1].uid, 1, 'spread'));
  });

  it('is empty when nothing about the saved look changed', () => {
    const r = recipeOf('plasma', 'palette');
    expect(staleParamsBetween(r, structuredClone(r))).toEqual([]);
  });
});

describe('audio inputs', () => {
  it('declares an audio uniform only when a modulation reads it', () => {
    const r = recipeOf('plasma', 'palette');
    expect(compileStudio(r).frag).not.toMatch(/u_audio/);
    r.blocks[0].mods = { scale: { source: 'bass', amount: 0.5 } };
    const frag = compileStudio(r).frag;
    expect(frag).toContain('uniform float u_audioBass;');
    expect(frag).not.toContain('u_audioBeat');
  });
});

describe('sensor modulation', () => {
  const binding = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };
  const sensorRecipe = () => {
    const r = recipeOf('fillbar', 'palette');
    r.blocks[0].uid = 'bar';
    r.blocks[1].uid = 'pal';
    r.blocks[0].params.level = 0;
    r.blocks[0].mods = { level: { source: 'sensor', amount: 1, sensor: binding } };
    return r;
  };

  it('declares no sensor uniform unless a mod reads one', () => {
    const plain = compileStudio(recipeOf('plasma', 'palette'));
    expect(plain.frag).not.toContain('// sensor');
    expect(plain.sensors).toEqual([]);
  });

  it('declares one annotated uniform per sensor-driven param and sweeps the param by it', () => {
    const { frag, sensors, params } = compileStudio(sensorRecipe(), { bake: true });
    expect(frag).toContain('uniform float u_bar_level_s; // sensor {"category":"quick","sensor":"summary/cpu-usage","min":0,"max":100}');
    expect(sensors).toEqual([{ name: 'u_bar_level_s', binding }]);
    expect(frag).toContain('clamp(u_bar_level + u_bar_level_m * 1.0 * u_bar_level_s, 0.0, 1.0)');
    expect(parseSensorUniforms(frag)).toEqual(sensors);
    // The service feeds it; it is neither a slider nor a saved param.
    expect(params).not.toHaveProperty('u_bar_level_s');
    expect(parseShaderParams(frag).map(p => p.name)).not.toContain('u_bar_level_s');
    expect(parseShaderParams(frag).map(p => p.name)).toContain('u_bar_level_m');
  });

  it('falls back to the default sensor when a mod carries none', () => {
    const r = sensorRecipe();
    delete r.blocks[0].mods!.level.sensor;
    expect(compileStudio(r).sensors[0].binding).toEqual(DEFAULT_SENSOR_BINDING);
  });

  it('changes the shader key with the annotation, and only then', () => {
    const a = compileStudio(sensorRecipe());
    const edited = sensorRecipe();
    edited.blocks[0].mods!.level.sensor = { ...binding, max: 80 };
    expect(compileStudio(edited).key).not.toBe(a.key);
    expect(compileStudio(sensorRecipe()).key).toBe(a.key);
  });

  it('uses sensors only when a mod names the sensor source', () => {
    expect(recipeUsesSensors(sensorRecipe())).toBe(true);
    expect(recipeUsesSensors(recipeOf('plasma', 'palette'))).toBe(false);
  });
});

describe('fill blocks', () => {
  it.each(['fillbar', 'fillclock', 'fillsegments', 'fillliquid', 'fillcenter', 'fillgauge'])('%s fills to a level and can turn and flip', type => {
    const keys = studioBlock(type)!.params.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining(['level', 'angle', 'flip']));
    expectValid(recipeOf(type, 'wheelramp'));
  });

  it('bakes every sensor starter to a shader a sensor uniform feeds', () => {
    for (const p of SENSOR_PREMADES) expect(compileStudio(p.build(), { bake: true }).sensors.length).toBeGreaterThan(0);
  });
});
