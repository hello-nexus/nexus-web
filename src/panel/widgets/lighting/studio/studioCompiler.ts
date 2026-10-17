import { STUDIO_UID_RE } from '../../../../api/customEffects';
import { recipeUsesWheel } from '../../../../lib/studioWheel';
import {
  DEFAULT_SENSOR_BINDING, cleanBinding, sensorAnnotationJson,
  type SensorBinding, type SensorUniform,
} from '../../../../lib/sensorBinding';
import {
  PATTERN_BLEND_PARAMS, STUDIO_STAGES, studioBlock,
  type StudioBlockDef, type StudioHelper, type StudioParam, type StudioStage,
} from './studioBlocks';

export type StudioMusicSource = 'bass' | 'mid' | 'high' | 'level' | 'beat';
export type StudioWaveSource = 'sine' | 'triangle' | 'square' | 'random';
export type StudioSensorSource = 'sensor';
export type StudioModSource = StudioMusicSource | StudioWaveSource | StudioSensorSource;

export const STUDIO_MUSIC_SOURCES: readonly StudioMusicSource[] = ['bass', 'mid', 'high', 'level', 'beat'];
export const STUDIO_WAVE_SOURCES: readonly StudioWaveSource[] = ['sine', 'triangle', 'square', 'random'];
export const STUDIO_SENSOR_SOURCE: StudioSensorSource = 'sensor';
export const STUDIO_MOD_SOURCES: readonly StudioModSource[] = [...STUDIO_MUSIC_SOURCES, ...STUDIO_WAVE_SOURCES, STUDIO_SENSOR_SOURCE];

export const isMusicSource = (s: StudioModSource): s is StudioMusicSource => (STUDIO_MUSIC_SOURCES as readonly string[]).includes(s);
export const isWaveSource = (s: StudioModSource): s is StudioWaveSource => (STUDIO_WAVE_SOURCES as readonly string[]).includes(s);
export const isSensorSource = (s: StudioModSource): s is StudioSensorSource => s === STUDIO_SENSOR_SOURCE;

/** A wave's cycles per second of effect time; the API enforces the same range. */
export const MOD_RATE = { min: 0.05, max: 4, step: 0.05, def: 0.5 } as const;
/** The share of a music level ignored before a mod reacts; the API enforces the same range. */
export const MOD_GATE = { min: 0, max: 0.9, step: 0.01 } as const;

const MOD_UNIFORM: Record<StudioMusicSource, string> = {
  bass: 'u_audioBass', mid: 'u_audioMid', high: 'u_audioHigh', level: 'u_audioLevel', beat: 'u_audioBeat',
};

export interface StudioMod {
  source: StudioModSource;
  /** Signed fraction of the param's range. */
  amount: number;
  /** Wave sources only: cycles per second of effect time. */
  rate?: number;
  /** Music sources only: the level below which the mod stays at rest. */
  gate?: number;
  /** The sensor source only: the author's default sensor and the range of it that sweeps the param. */
  sensor?: SensorBinding;
}

export interface StudioBlock {
  /** Stable per-instance id for React keys and drag order; not part of the shader. */
  uid: string;
  type: string;
  params: Record<string, number>;
  /** Normalized RGB, keyed by StudioColor.key. */
  colors?: Record<string, [number, number, number]>;
  mods?: Record<string, StudioMod>;
}

/** A block param surfaced as a slider in the Lighting page's effect controls. */
export interface StudioKnob {
  uid: string;
  key: string;
}

export interface StudioRecipe {
  v: 1;
  blocks: StudioBlock[];
  knobs?: StudioKnob[];
  /** Wire units, same as EffectState.speed. */
  speed: number;
  hue: number;
  saturation: number;
  contrast: number;
  /** A wheel-colored recipe's range: 1 less the wheel arc's share of the circle, 0 to 1. Never baked; the wheel state is the effect's own. */
  colorize?: number;
}

export interface CompiledStudio {
  /** Shader-cache key; changes only when the GLSL text changes, never on a param value. */
  key: string;
  frag: string;
  /** Uniform values for EffectState.params. */
  params: Record<string, number>;
  /** The sensor-fed uniforms the frag declares, with their default bindings. */
  sensors: SensorUniform[];
}

let uidCounter = 0;
export function newBlockUid(): string {
  uidCounter += 1;
  return `b${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

/** Blocks in data-flow order: stages first, then each stage's own order. */
export function orderedBlocks(recipe: StudioRecipe): StudioBlock[] {
  return STUDIO_STAGES.flatMap(stage => recipe.blocks.filter(b => studioBlock(b.type)?.stage === stage));
}

export function blockParams(def: StudioBlockDef, firstPattern: boolean): readonly StudioParam[] {
  return def.stage === 'pattern' && !firstPattern ? [...def.params, ...PATTERN_BLEND_PARAMS] : def.params;
}

export function makeBlock(type: string): StudioBlock {
  const def = studioBlock(type);
  const params: Record<string, number> = {};
  for (const p of def?.params ?? []) params[p.key] = p.def;
  for (const p of PATTERN_BLEND_PARAMS) if (def?.stage === 'pattern') params[p.key] = p.def;
  const block: StudioBlock = { uid: newBlockUid(), type, params };
  if (def?.colors) {
    block.colors = Object.fromEntries(def.colors.map(c => [c.key, [...c.def] as [number, number, number]]));
  }
  return block;
}

const HELPERS: Record<StudioHelper, { deps: StudioHelper[]; src: string }> = {
  rot: { deps: [], src: 'mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }' },
  hash21: {
    deps: [],
    src: 'float hash21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }',
  },
  vnoise: {
    deps: ['hash21'],
    src: [
      'float vnoise(vec2 p) {',
      '  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  float a = hash21(i); float b = hash21(i + vec2(1.0, 0.0));',
      '  float c = hash21(i + vec2(0.0, 1.0)); float d = hash21(i + vec2(1.0, 1.0));',
      '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
      '}',
    ].join('\n'),
  },
  fbm: {
    deps: ['vnoise'],
    src: [
      'float fbm(vec2 p) {',
      '  float s = 0.0; float a = 0.5;',
      '  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }',
      '  return s / 0.96875;',
      '}',
    ].join('\n'),
  },
  blendV: {
    deps: [],
    src: [
      'float blendV(float a, float b, float mode, float amt) {',
      '  float r = a + b;',
      '  if (mode > 0.5) r = a * b;',
      '  if (mode > 1.5) r = max(a, b);',
      '  if (mode > 2.5) r = min(a, b);',
      '  if (mode > 3.5) r = abs(a - b);',
      '  if (mode > 4.5) r = 1.0 - (1.0 - a) * (1.0 - b);',
      '  return clamp(mix(a, r, amt), 0.0, 1.0);',
      '}',
    ].join('\n'),
  },
  // Order matches PALETTE_OPTIONS.
  presetPal: {
    deps: [],
    src: [
      'vec3 presetPal(float k, float id) {',
      '  vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 c = vec3(1.0); vec3 d = vec3(0.0, 0.33, 0.67);',
      '  if (id > 0.5) { d = vec3(0.0, 0.1, 0.2); }',
      '  if (id > 1.5) { a = vec3(0.1, 0.4, 0.6); b = vec3(0.1, 0.3, 0.4); d = vec3(0.6, 0.5, 0.4); }',
      '  if (id > 2.5) { a = vec3(0.5, 0.3, 0.7); b = vec3(0.5, 0.4, 0.3); d = vec3(0.0, 0.5, 0.25); }',
      '  if (id > 3.5) { a = vec3(0.6, 0.25, 0.05); b = vec3(0.4, 0.25, 0.05); c = vec3(0.5); d = vec3(0.5); }',
      '  if (id > 4.5) { a = vec3(0.3, 0.6, 0.2); b = vec3(0.3, 0.4, 0.2); c = vec3(1.0); d = vec3(0.2, 0.0, 0.5); }',
      '  if (id > 5.5) { a = vec3(0.8, 0.5, 0.7); b = vec3(0.2, 0.3, 0.3); d = vec3(0.0, 0.33, 0.67); }',
      '  if (id > 6.5) { a = vec3(0.6, 0.8, 0.95); b = vec3(0.4, 0.2, 0.05); c = vec3(0.5); d = vec3(0.5); }',
      '  if (id > 7.5) { a = vec3(0.5); b = vec3(0.5); c = vec3(0.5); d = vec3(0.5); }',
      '  return clamp(a + b * cos(6.2831853 * (c * k + d)), 0.0, 1.0);',
      '}',
    ].join('\n'),
  },
  grad3: {
    deps: [],
    src: [
      'vec3 grad3(float k, vec3 a, vec3 b, vec3 c) {',
      '  k = fract(k) * 3.0;',
      '  vec3 r = mix(a, b, smoothstep(0.0, 1.0, clamp(k, 0.0, 1.0)));',
      '  r = mix(r, c, smoothstep(0.0, 1.0, clamp(k - 1.0, 0.0, 1.0)));',
      '  return mix(r, a, smoothstep(0.0, 1.0, clamp(k - 2.0, 0.0, 1.0)));',
      '}',
    ].join('\n'),
  },
};

const HELPER_ORDER: StudioHelper[] = ['rot', 'hash21', 'vnoise', 'fbm', 'blendV', 'presetPal', 'grad3'];

// Same contract as nexus-service's _prelude.frag: these names and hint_ranges
// are what both renderers bind from EffectState.
const HEADER = `#version 330 core
out vec4 fragColor;
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_speed;      // hint_range(-2.0, 2.0, 0.02) = 1.0
uniform float u_hue;        // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_colorize;   // hint_range(0.0, 1.0, 0.01) = 0.0
uniform float u_saturation; // hint_range(0.0, 4.0, 0.01) = 1.0
uniform float u_contrast;   // hint_range(0.0, 4.0, 0.01) = 1.0
const float PI = 3.14159265;`;

// A wheel-colored recipe takes its colors from the wheel's hue and range, so the colorize tint (which would
// wash them toward one hue) is left out of the finish.
const WHEEL_FINALIZE = `vec3 finalize(vec3 col, float hue) {
  float bl = dot(max(col, 0.0), vec3(0.2126, 0.7152, 0.0722));
  vec3 blended = mix(vec3(bl), col, clamp(u_saturation * S_SAT, 0.0, 4.0));
  blended = (blended - 0.5) * clamp(u_contrast * S_CON, 0.0, 4.0) + 0.5;
  return max(blended, 0.0);
}`;

const FOOTER_HELPERS = `vec2 uvCentered() {
  vec2 u = gl_FragCoord.xy / u_resolution;
  u.y = 1.0 - u.y;
  u = u * 2.0 - 1.0;
  u.x *= u_resolution.x / u_resolution.y;
  return u;
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 finalize(vec3 col, float hue) {
  float luma = dot(max(col, 0.0), vec3(0.2126, 0.7152, 0.0722));
  vec3 blended = mix(col, luma * hsv2rgb(vec3(hue, 1.0, 1.0)) * 1.4, clamp(u_colorize, 0.0, 1.0));
  float bl = dot(max(blended, 0.0), vec3(0.2126, 0.7152, 0.0722));
  blended = mix(vec3(bl), blended, clamp(u_saturation * S_SAT, 0.0, 4.0));
  blended = (blended - 0.5) * clamp(u_contrast * S_CON, 0.0, 4.0) + 0.5;
  return max(blended, 0.0);
}`;

// Fixed-point so no value prints in exponent form, which hint_range parsing rejects.
function fmt(n: number): string {
  const s = n.toFixed(5).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
}

/** Keyed by block uid, so a slider keeps its uniform (and any saved value) across reorders. */
export function studioUniform(uid: string, index: number, key: string): string {
  return `u_${STUDIO_UID_RE.test(uid) ? uid : `b${index}`}_${key}`;
}

function collectHelpers(defs: StudioBlockDef[], needsBlend: boolean, extra: ReadonlySet<StudioHelper> = new Set()): string[] {
  const wanted = new Set<StudioHelper>();
  const add = (h: StudioHelper) => {
    if (wanted.has(h)) return;
    wanted.add(h);
    HELPERS[h].deps.forEach(add);
  };
  defs.forEach(d => d.helpers?.forEach(add));
  extra.forEach(add);
  if (needsBlend) add('blendV');
  return HELPER_ORDER.filter(h => wanted.has(h)).map(h => HELPERS[h].src);
}

/** Whether `recipe` reads the music: a music mod or a block that visualizes it. */
export function recipeUsesAudio(recipe: StudioRecipe): boolean {
  return recipe.blocks.some(b => !!studioBlock(b.type)?.audio?.length || Object.values(b.mods ?? {}).some(m => isMusicSource(m.source)));
}

/** Whether `recipe` has a param driven by a sensor. */
export function recipeUsesSensors(recipe: StudioRecipe): boolean {
  return recipe.blocks.some(b => Object.values(b.mods ?? {}).some(m => isSensorSource(m.source)));
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function clampParam(p: StudioParam, value: number | undefined): number {
  const v = value ?? p.def;
  return Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
}

/**
 * Compiles a recipe into one self-contained GLSL 330 fragment shader. Every
 * block param is a hint_range uniform, so slider moves only change `params`;
 * the GLSL (and `key`) changes on block add/remove/reorder/type and mod routing.
 * `bake` writes the recipe's values in as the uniform defaults and its speed,
 * hue, saturation and contrast as constants, so the saved shader renders the
 * recipe under a neutral EffectState and the effect controls adjust on top.
 */
export function compileStudio(recipe: StudioRecipe, { bake = false }: { bake?: boolean } = {}): CompiledStudio {
  const blocks = orderedBlocks(recipe);
  const defs = blocks.map(b => studioBlock(b.type)!);
  const uniforms: string[] = [];
  // Audio inputs are declared only when a mod or block reads them. The service starts
  // audio capture for a shader with an active audio uniform, and whether a
  // declared-but-unused one stays active after linking differs by driver.
  const audioInputs = new Set<string>();
  defs.forEach(d => d.audio?.forEach(a => audioInputs.add(a)));
  const params: Record<string, number> = {};
  const extraHelpers = new Set<StudioHelper>();
  const sensors: SensorUniform[] = [];
  const body: string[] = [];
  let patternIndex = 0;
  const lastPattern = defs.reduce((last, d, i) => (d.stage === 'pattern' ? i : last), -1);

  blocks.forEach((block, i) => {
    const def = defs[i];
    const first = def.stage === 'pattern' && patternIndex === 0;
    const list = blockParams(def, first);
    const exprs: Record<string, string> = {};
    list.forEach((p, pi) => {
      const name = studioUniform(block.uid, i, p.key);
      const value = clampParam(p, block.params[p.key]);
      uniforms.push(`uniform float ${name}; // hint_range(${fmt(p.min)}, ${fmt(p.max)}, ${fmt(p.step)}) = ${fmt(bake ? value : p.def)}`);
      params[name] = value;
      const mod = p.options ? undefined : block.mods?.[p.key];
      if (mod) {
        const modName = `${name}_m`;
        const amount = Math.min(1, Math.max(-1, mod.amount));
        uniforms.push(`uniform float ${modName}; // hint_range(-1.0, 1.0, 0.01) = ${fmt(bake ? amount : 0.5)}`);
        params[modName] = amount;
        let signal: string;
        if (isMusicSource(mod.source)) {
          audioInputs.add(MOD_UNIFORM[mod.source]);
          signal = MOD_UNIFORM[mod.source];
          // Emitted only when set, so a recipe without a gate compiles exactly as before.
          if (mod.gate !== undefined && mod.gate > 0) {
            const gateName = `${name}_g`;
            const gate = Math.min(MOD_GATE.max, Math.max(MOD_GATE.min, mod.gate));
            uniforms.push(`uniform float ${gateName}; // hint_range(${fmt(MOD_GATE.min)}, ${fmt(MOD_GATE.max)}, ${fmt(MOD_GATE.step)}) = ${fmt(bake ? gate : 0)}`);
            params[gateName] = gate;
            signal = `clamp((${signal} - ${gateName}) / (1.0 - ${gateName}), 0.0, 1.0)`;
          }
        } else if (isSensorSource(mod.source)) {
          // Not a slider: the service feeds this uniform the smoothed 0..1 reading of the annotated sensor.
          const sensorName = `${name}_s`;
          const binding = cleanBinding(mod.sensor ?? DEFAULT_SENSOR_BINDING);
          uniforms.push(`uniform float ${sensorName}; // sensor ${sensorAnnotationJson(binding)}`);
          sensors.push({ name: sensorName, binding });
          signal = sensorName;
        } else {
          const rateName = `${name}_r`;
          const rate = Math.min(MOD_RATE.max, Math.max(MOD_RATE.min, mod.rate ?? MOD_RATE.def));
          uniforms.push(`uniform float ${rateName}; // hint_range(${fmt(MOD_RATE.min)}, ${fmt(MOD_RATE.max)}, ${fmt(MOD_RATE.step)}) = ${fmt(bake ? rate : MOD_RATE.def)}`);
          params[rateName] = rate;
          const ph = `(t * ${rateName})`;
          signal = mod.source === 'sine' ? `(0.5 + 0.5 * sin(${ph} * 6.2831853))`
            : mod.source === 'triangle' ? `(1.0 - abs(fract(${ph}) * 2.0 - 1.0))`
              : mod.source === 'square' ? `step(0.5, fract(${ph}))`
                : `hash21(vec2(floor(${ph}), ${fmt(i * 16 + pi + 1)}))`;
          if (mod.source === 'random') extraHelpers.add('hash21');
        }
        const swept = `clamp(${name} + ${modName} * ${fmt(p.max - p.min)} * ${signal}, ${fmt(p.min)}, ${fmt(p.max)})`;
        // A count between integers seams at the atan wrap (kaleidoscope, spiral).
        exprs[p.key] = p.whole ? `floor(${swept} + 0.5)` : swept;
      } else {
        exprs[p.key] = name;
      }
    });
    for (const c of def.colors ?? []) {
      const rgb = block.colors?.[c.key] ?? c.def;
      const names = ['r', 'g', 'b'].map(ch => studioUniform(block.uid, i, `${c.key}${ch}`));
      names.forEach((n, k) => {
        const value = Math.min(1, Math.max(0, rgb[k]));
        uniforms.push(`uniform float ${n}; // hint_range(0.0, 1.0, 0.001) = ${fmt(bake ? value : c.def[k])}`);
        params[n] = value;
      });
      exprs[c.key] = `vec3(${names.join(', ')})`;
    }
    const keys = Object.keys(exprs).sort((a, b) => b.length - a.length);
    let code = def.code;
    // Only the last pattern block's position colors the field: an earlier fill keeps its own, out of reach.
    if (def.fieldPos === 'writes' && i !== lastPattern) code = `float localPos = -1.0; ${code.replace(/\bfieldPos\b/g, 'localPos')}`;
    for (const k of keys) code = code.split(`$${k}`).join(`(${exprs[k]})`);

    if (def.stage === 'pattern') {
      const combine = first ? 'v = f;' : `v = blendV(v, f, ${exprs.blend}, ${exprs.mix});`;
      body.push(`  { float f = 0.0;\n${indent(code)}\n    ${combine} }`);
      patternIndex += 1;
    } else {
      body.push(`  {\n${indent(code)}\n  }`);
    }
  });

  const needsBlend = patternIndex > 1;
  const hasColor = defs.some(d => d.stage === 'color');
  const wheel = recipeUsesWheel(recipe);
  const base = bake
    ? [recipe.speed / 50, wheel ? 0 : recipe.hue, recipe.saturation, recipe.contrast]
    : [1, 0, 1, 1];
  const frag = [
    HEADER,
    `const float S_SPEED = ${fmt(base[0])};`,
    `const float S_HUE = ${fmt(base[1])};`,
    `const float S_SAT = ${fmt(base[2])};`,
    `const float S_CON = ${fmt(base[3])};`,
    ...(wheel ? ['const float S_COLORIZE = 0.0;'] : []),
    ...[...audioInputs].sort().map(u => (u === 'u_spectrum' ? 'uniform float u_spectrum[16];' : `uniform float ${u};`)),
    ...uniforms,
    ...collectHelpers(defs, needsBlend, extraHelpers),
    wheel ? FOOTER_HELPERS.replace(/vec3 finalize[\s\S]*$/, WHEEL_FINALIZE) : FOOTER_HELPERS,
    'void main() {',
    '  vec2 p0 = uvCentered();',
    '  vec2 p = p0;',
    '  float t = mod(u_time, 3600.0) * u_speed * S_SPEED;',
    '  float hue = u_hue + S_HUE;',
    '  float v = 0.0;',
    ...(defs.some(d => d.fieldPos) ? ['  float fieldPos = -1.0;'] : []),
    '  vec3 col = vec3(0.0);',
    ...insertColorDefault(body, defs, hasColor),
    '  fragColor = vec4(finalize(col, hue), 1.0);',
    '}',
  ].join('\n');

  return { key: `studio-${fnv1a(frag)}`, frag, params, sensors };
}

function insertColorDefault(body: string[], defs: StudioBlockDef[], hasColor: boolean): string[] {
  if (hasColor) return body;
  const firstFinish = defs.findIndex(d => d.stage === 'finish');
  const gray = '  col = vec3(v);';
  if (firstFinish < 0) return [...body, gray];
  return [...body.slice(0, firstFinish), gray, ...body.slice(firstFinish)];
}

function indent(code: string): string {
  return code.split('\n').map(l => `    ${l}`).join('\n');
}

export function recipeCost(recipe: StudioRecipe): number {
  return recipe.blocks.reduce((sum, b) => sum + (studioBlock(b.type)?.cost ?? 0), 0);
}

export function stageCount(recipe: StudioRecipe, stage: StudioStage): number {
  return recipe.blocks.filter(b => studioBlock(b.type)?.stage === stage).length;
}

/** Uniforms whose saved value changed, that no longer exist, or whose knob was unpinned between two saves. */
export function staleParamsBetween(previous: StudioRecipe, next: StudioRecipe): string[] {
  const before = compileStudio(previous, { bake: true }).params;
  const after = compileStudio(next, { bake: true }).params;
  const pinned = (r: StudioRecipe) => new Set((r.knobs ?? []).map(k => `${k.uid}:${k.key}`));
  const nowPinned = pinned(next);
  const unpinned = [...pinned(previous)].filter(k => !nowPinned.has(k)).map(k => {
    const [uid, key] = k.split(':');
    return studioUniform(uid, -1, key);
  });
  const changed = Object.keys(before).filter(name => !(name in after) || before[name] !== after[name]);
  return [...new Set([...changed, ...unpinned])];
}
