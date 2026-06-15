import type { LightingMode } from '../hooks/useLightingSync';

export type { LightingMode };

/**
 * Per-animate-effect slider state. All sliders on the AnimateDrawer map onto
 * these fields. `params` holds effect-specific uniforms keyed by GLSL name.
 */
export interface EffectState {
  speed: number;         // -100..100 (bipolar; negative reverses time)
  intensity: number;     // 0..1
  hue: number;           // 0..1
  colorize: number;      // 0 = pure hue shift, 1 = grayscale + colorize
  saturation: number;    // 0 = grayscale, 1 = unchanged, 2 = oversaturated
  contrast: number;      // 0 = flat, 1 = unchanged, 2 = hard contrast
  params: Record<string, number>;
}

export interface EffectParamDef {
  name: string;   // GLSL uniform name (e.g. u_zoom)
  label: string;  // display label
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export type EffectCategory =
  | 'simple'
  | 'audio'
  | 'cosmic'
  | 'organic'
  | 'geometric'
  | 'pattern';

// Section order for the effect listing: simple fills first, then organic, then
// the rest, with the audio-reactive set last.
export const EFFECT_CATEGORIES: EffectCategory[] = [
  'simple', 'organic', 'cosmic', 'geometric', 'pattern', 'audio',
];

// The "simple" family: one cheap solid-fill shader (simple.frag) reused for
// every colour. The colour is driven entirely by the post-process tint
// (hue / colorize / saturation), so each entry differs only by its template
// feels - see SIMPLE_COLORS / buildDefaultTemplates in lightingTemplates.ts.
export const SIMPLE_EFFECT_KEYS = [
  'simplered', 'simpleorange', 'simpleyellow', 'simplegreen', 'simplecyan',
  'simpleblue', 'simpleviolet', 'simplepink',
] as const;

export interface EffectDef {
  key: string;
  labelKey: string;
  /** Computed via {@link categoryOf} - the EFFECT_CATEGORY map below is the source of truth. */
  category?: EffectCategory;
  params: EffectParamDef[];
  showIntensity?: boolean;
  audio?: boolean;
}

/** Resolve the category for an effect key, falling back to "pattern" for any
 * unmapped key so a missing entry never crashes the chip filter. */
export function categoryOf(key: string): EffectCategory {
  return EFFECT_CATEGORY[key] ?? 'pattern';
}

// Authored category for every effect. One category per effect - keeps the
// chip filter exclusive (clicking "Audio" shows the audio set, not "audio +
// anything also tagged audio"). When borderline (e.g. starpath could be
// either cosmic or atmospheric), pick the dominant visual character.
export const EFFECT_CATEGORY: Record<string, EffectCategory> = {
  // Simple solid-colour fills (8).
  simplered: 'simple', simpleorange: 'simple', simpleyellow: 'simple',
  simplegreen: 'simple', simplecyan: 'simple', simpleblue: 'simple',
  simpleviolet: 'simple', simplepink: 'simple',
  // Audio-reactive set (8).
  spectrumbars: 'audio', spectrumradial: 'audio', scope: 'audio',
  basspulse: 'audio', beatstrobe: 'audio', harmonicstar: 'audio',
  audiotunnel: 'audio', bassbloom: 'audio',
  // Cosmic: space, sky, electric (13).
  aurora: 'cosmic', starfield: 'cosmic', nebula: 'cosmic', cosmicdust: 'cosmic',
  caustics: 'cosmic', galaxy: 'cosmic', starpath: 'cosmic', meteor: 'cosmic',
  bokeh: 'cosmic', bursts: 'cosmic', lightning: 'cosmic', plasmaglobe: 'cosmic',
  neonrain: 'cosmic',
  // Organic: fluid, fire, smoke, natural texture (16).
  plasma: 'organic', fire: 'organic', watercolor: 'organic', jellyfish: 'organic',
  lavalamp: 'organic', inkbloom: 'organic', oilslick: 'organic',
  ferrofluid: 'organic', liquidchrome: 'organic', flowfield: 'organic',
  bubbles: 'organic', silkwave: 'organic', vapor: 'organic', satinflow: 'organic',
  lavafissure: 'organic', sandstorm: 'organic',
  // Geometric: tunnels, lattices, fractals, structured (18).
  spiral: 'geometric', voronoi: 'geometric', kaleidoscope: 'geometric',
  wormhole: 'geometric', sacredgeometry: 'geometric', tessellation: 'geometric',
  chromaspiral: 'geometric', neongrid: 'geometric', hextunnel: 'geometric',
  mandelbrot: 'geometric', circuit: 'geometric', crystaltunnel: 'geometric',
  ringtunnel: 'geometric', vortextunnel: 'geometric', helixtunnel: 'geometric',
  boxtunnel: 'geometric', harlequin: 'geometric', mosaic: 'geometric',
  // Pattern: waves, gradients, abstract graphic shapes (18).
  rainbow: 'pattern', matrix: 'pattern', ripple: 'pattern', wave: 'pattern',
  gradientwave: 'pattern', ball: 'pattern', radar: 'pattern', pulse: 'pattern',
  interference: 'pattern', domainwarp: 'pattern', dotmatrix: 'pattern',
  prismwave: 'pattern', ribbonflow: 'pattern', meshgradient: 'pattern',
  tide: 'pattern', ridgeline: 'pattern', chevron: 'pattern', terrace: 'pattern',
};

export const BASE_DEFAULTS: Omit<EffectState, 'params'> = {
  speed: 50, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1,
};

export const MODES: { key: LightingMode; labelKey: string }[] = [
  { key: 'none', labelKey: 'lighting.mode.off' },
  { key: 'animate', labelKey: 'lighting.mode.animate' },
  { key: 'gif', labelKey: 'lighting.mode.gif' },
  { key: 'screen', labelKey: 'lighting.mode.screen' },
];

// Simple fills share three tweaks: gradient boldness (0 = flat solid colour,
// max = strong dark->light ramp), wave amount (0 = still, max = a gentle wave
// flowing along the gradient direction), and the gradient's rotation in degrees
// (0 = vertical). One shared array since every simple colour is the same
// shader; it's read-only so sharing the reference is safe.
const SIMPLE_PARAMS: EffectParamDef[] = [
  { name: 'u_gradient', label: 'Gradient', min: 0, max: 1,   step: 0.02, defaultValue: 0.6 },
  { name: 'u_wave',     label: 'Wave',     min: 0, max: 1,   step: 0.02, defaultValue: 0.5 },
  { name: 'u_rotation', label: 'Rotation', min: 0, max: 360, step: 5,    defaultValue: 0 },
];

export const EFFECTS: EffectDef[] = [
  // Simple solid-colour fills lead the list. A vertical gradient (boldness +
  // rotation) is the only per-effect tweak; hue / saturation / speed come from
  // the template feels.
  { key: 'simplered',    labelKey: 'lighting.controls.simplered',    params: SIMPLE_PARAMS },
  { key: 'simpleorange', labelKey: 'lighting.controls.simpleorange', params: SIMPLE_PARAMS },
  { key: 'simpleyellow', labelKey: 'lighting.controls.simpleyellow', params: SIMPLE_PARAMS },
  { key: 'simplegreen',  labelKey: 'lighting.controls.simplegreen',  params: SIMPLE_PARAMS },
  { key: 'simplecyan',   labelKey: 'lighting.controls.simplecyan',   params: SIMPLE_PARAMS },
  { key: 'simpleblue',   labelKey: 'lighting.controls.simpleblue',   params: SIMPLE_PARAMS },
  { key: 'simpleviolet', labelKey: 'lighting.controls.simpleviolet', params: SIMPLE_PARAMS },
  { key: 'simplepink',   labelKey: 'lighting.controls.simplepink',   params: SIMPLE_PARAMS },
  { key: 'plasma',       labelKey: 'lighting.controls.plasma',       params: [
      { name: 'u_warp', label: 'Warp',  min: 0,   max: 2,   step: 0.05, defaultValue: 1 },
      { name: 'u_zoom', label: 'Zoom',  min: 0.5, max: 3,   step: 0.05, defaultValue: 1 },
  ]},
  { key: 'fire',         labelKey: 'lighting.controls.fire',         params: [{ name: 'u_turbulence', label: 'Turbulence', min: 1, max: 3, step: 0.05, defaultValue: 1.6 }] },
  { key: 'rainbow',     labelKey: 'lighting.controls.rainbow',     params: [
      { name: 'u_density',  label: 'Density',  min: 0.2, max: 3,   step: 0.05, defaultValue: 1 },
      { name: 'u_rotation', label: 'Rotation', min: 0,   max: 360, step: 5,    defaultValue: 0 },
  ]},
  { key: 'spiral',       labelKey: 'lighting.controls.spiral',       params: [
      { name: 'u_arms',      label: 'Arms',      min: 1, max: 10, step: 1,   defaultValue: 5 },
      { name: 'u_tightness', label: 'Tightness', min: 2, max: 16, step: 0.5, defaultValue: 8 },
  ]},
  { key: 'matrix',       labelKey: 'lighting.controls.matrix',       params: [
      { name: 'u_columns', label: 'Columns', min: 8, max: 60, step: 1, defaultValue: 28 },
      { name: 'u_fade',    label: 'Fade',    min: 1, max: 12, step: 0.5, defaultValue: 4 },
  ]},
  { key: 'meteor',       labelKey: 'lighting.controls.meteor',       params: [
      { name: 'u_streaks', label: 'Streaks', min: 1,    max: 16,  step: 1,    defaultValue: 6 },
      { name: 'u_width',   label: 'Size',    min: 0.03, max: 0.3, step: 0.005, defaultValue: 0.13 },
  ]},
  { key: 'ripple',       labelKey: 'lighting.controls.ripple',       params: [{ name: 'u_freq', label: 'Frequency', min: 3, max: 30, step: 0.5, defaultValue: 12 }] },
  { key: 'wave',         labelKey: 'lighting.controls.wave',         params: [
      { name: 'u_freq', label: 'Frequency', min: 2,    max: 16,   step: 0.5, defaultValue: 8 },
      { name: 'u_amp',  label: 'Amplitude', min: 0.05, max: 0.4, step: 0.01, defaultValue: 0.18 },
  ]},
  { key: 'gradientwave', labelKey: 'lighting.controls.gradientwave', params: [{ name: 'u_freq', label: 'Frequency', min: 2, max: 18, step: 0.5, defaultValue: 6 }] },
  { key: 'ball',         labelKey: 'lighting.controls.ball',         params: [
      { name: 'u_count', label: 'Ball count', min: 1,    max: 24,  step: 1,    defaultValue: 8 },
      { name: 'u_size',  label: 'Size',       min: 0.03, max: 0.25, step: 0.005, defaultValue: 0.08 },
  ]},
  { key: 'radar',        labelKey: 'lighting.controls.radar',        params: [{ name: 'u_ringRate', label: 'Ring rate', min: 0.05, max: 1, step: 0.02, defaultValue: 0.25 }] },
  { key: 'pulse',        labelKey: 'lighting.controls.pulse',        showIntensity: true, params: [{ name: 'u_size', label: 'Size', min: 0.4, max: 1.8, step: 0.02, defaultValue: 1.2 }] },
  { key: 'watercolor',  labelKey: 'lighting.controls.watercolor',  params: [
      { name: 'u_blobs',    label: 'Blobs',    min: 2,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_softness', label: 'Softness', min: 0.1, max: 1.0, step: 0.02, defaultValue: 0.5 },
  ]},
  { key: 'jellyfish',   labelKey: 'lighting.controls.jellyfish',   params: [
      { name: 'u_count', label: 'Count', min: 1,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_glow',  label: 'Glow',  min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'aurora',       labelKey: 'lighting.controls.aurora',       params: [
      { name: 'u_curtains', label: 'Curtains', min: 1,   max: 8,   step: 1,    defaultValue: 4 },
      { name: 'u_height',   label: 'Height',   min: 0.2, max: 1.0, step: 0.02, defaultValue: 0.55 },
      { name: 'u_shimmer',  label: 'Shimmer',  min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.5 },
  ]},
  { key: 'lavalamp',     labelKey: 'lighting.controls.lavalamp',     params: [
      { name: 'u_count',     label: 'Blobs',     min: 2,    max: 10,  step: 1,    defaultValue: 5 },
      { name: 'u_viscosity', label: 'Viscosity', min: 0.1,  max: 1.0, step: 0.02, defaultValue: 0.45 },
      { name: 'u_size',      label: 'Size',      min: 0.08, max: 0.5, step: 0.01, defaultValue: 0.22 },
  ]},
  { key: 'starfield',    labelKey: 'lighting.controls.starfield',    params: [
      { name: 'u_density', label: 'Density',     min: 8,   max: 60, step: 1,    defaultValue: 45 },
      { name: 'u_layers',  label: 'Depth layers', min: 1,  max: 8,  step: 1,    defaultValue: 5 },
      { name: 'u_trail',   label: 'Trail',       min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'voronoi',      labelKey: 'lighting.controls.voronoi',      params: [
      { name: 'u_scale',     label: 'Scale',       min: 1.0, max: 6.0, step: 0.1,  defaultValue: 3 },
      { name: 'u_edgeWidth', label: 'Edge width',  min: 0.01, max: 0.15, step: 0.005, defaultValue: 0.05 },
      { name: 'u_drift',     label: 'Drift',       min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'neonrain',     labelKey: 'lighting.controls.neonrain',     params: [
      { name: 'u_density', label: 'Density', min: 12,   max: 80,  step: 1,    defaultValue: 28 },
      { name: 'u_length',  label: 'Length',  min: 0.03, max: 0.5, step: 0.01, defaultValue: 0.30 },
      { name: 'u_splash',  label: 'Splash',  min: 0.0,  max: 1.0, step: 0.02, defaultValue: 0.85 },
  ]},
  { key: 'nebula',        labelKey: 'lighting.controls.nebula',       params: [
      { name: 'u_density', label: 'Density', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_stars',   label: 'Stars',   min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
      { name: 'u_depth',   label: 'Layers',  min: 1,   max: 6,   step: 1,    defaultValue: 4 },
  ]},
  { key: 'bursts',        labelKey: 'lighting.controls.bursts',       params: [
      { name: 'u_rate',      label: 'Rate',      min: 0.2, max: 6.0, step: 0.1,  defaultValue: 1.8 },
      { name: 'u_particles', label: 'Particles', min: 3,   max: 20,  step: 1,    defaultValue: 14 },
      { name: 'u_size',      label: 'Size',      min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.1 },
  ]},
  { key: 'lavafissure',   labelKey: 'lighting.controls.lavafissure',  params: [
      { name: 'u_flow',       label: 'Flow',     min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_crackWidth', label: 'Cracks',   min: 0.1, max: 0.9, step: 0.02, defaultValue: 0.35 },
      { name: 'u_shimmer',    label: 'Shimmer',  min: 0.0, max: 1.5, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'kaleidoscope',  labelKey: 'lighting.controls.kaleidoscope', params: [
      { name: 'u_sides', label: 'Sides', min: 3,   max: 12,  step: 1,    defaultValue: 8 },
      { name: 'u_spin',  label: 'Spin',  min: -2,  max: 2,   step: 0.05, defaultValue: 0.4 },
      { name: 'u_inner', label: 'Detail', min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'wormhole',      labelKey: 'lighting.controls.wormhole',     params: [
      { name: 'u_depth', label: 'Depth', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_rings', label: 'Rings', min: 2,   max: 16,  step: 1,    defaultValue: 5 },
      { name: 'u_twist', label: 'Twist', min: -2,  max: 2,   step: 0.05, defaultValue: 0.6 },
  ]},
  { key: 'interference',  labelKey: 'lighting.controls.interference', params: [
      { name: 'u_wavelength', label: 'Wavelength', min: 0.05, max: 1.0, step: 0.01, defaultValue: 0.22 },
      { name: 'u_sources',    label: 'Sources',    min: 2,    max: 8,   step: 1,    defaultValue: 5 },
  ]},
  { key: 'sacredgeometry', labelKey: 'lighting.controls.sacredgeometry', params: [
      { name: 'u_layers', label: 'Layers', min: 2,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_edge',   label: 'Edge',   min: 0.2, max: 1.2, step: 0.02, defaultValue: 0.6 },
      { name: 'u_pulse',  label: 'Pulse',  min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'tessellation',  labelKey: 'lighting.controls.tessellation', params: [
      { name: 'u_shape', label: 'Shape', min: 0,    max: 2,   step: 1,    defaultValue: 0 },
      { name: 'u_morph', label: 'Morph', min: 0.0,  max: 1.3, step: 0.02, defaultValue: 0.6 },
      { name: 'u_edge',  label: 'Edge',  min: 0.02, max: 0.35, step: 0.01, defaultValue: 0.15 },
  ]},
  { key: 'domainwarp',    labelKey: 'lighting.controls.domainwarp',   params: [
      { name: 'u_turbulence', label: 'Turbulence', min: 0.2, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_direction',  label: 'Direction',  min: -3.14, max: 3.14, step: 0.05, defaultValue: 0 },
      { name: 'u_bite',       label: 'Bite',       min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'inkbloom',      labelKey: 'lighting.controls.inkbloom',     params: [
      { name: 'u_spread', label: 'Spread', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_curl',   label: 'Curl',   min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.6 },
      { name: 'u_fade',   label: 'Fade',   min: 0.3, max: 3.0, step: 0.05, defaultValue: 0.7 },
  ]},
  { key: 'cosmicdust',    labelKey: 'lighting.controls.cosmicdust',   params: [
      { name: 'u_particles', label: 'Density', min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.8 },
      { name: 'u_twinkle',   label: 'Twinkle', min: 0.2, max: 4.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_parallax',  label: 'Parallax', min: 0.0, max: 1.2, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'chromaspiral',  labelKey: 'lighting.controls.chromaspiral', params: [
      { name: 'u_tightness', label: 'Tightness', min: 1.0, max: 12.0, step: 0.1, defaultValue: 5.0 },
      { name: 'u_spin',      label: 'Spin',      min: -3.0, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_bands',     label: 'Bands',     min: 1,    max: 12,   step: 1,    defaultValue: 3 },
  ]},
  { key: 'neongrid',      labelKey: 'lighting.controls.neongrid',     params: [
      { name: 'u_density', label: 'Cells',  min: 3,   max: 30,  step: 1,    defaultValue: 12 },
      { name: 'u_pulse',   label: 'Pulse',  min: 0.0, max: 2.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_glow',    label: 'Glow',   min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'oilslick',      labelKey: 'lighting.controls.oilslick',     params: [
      { name: 'u_flow',         label: 'Flow',         min: 0.1, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_iridescence',  label: 'Iridescence',  min: 0.3, max: 4.0, step: 0.05, defaultValue: 2.5 },
      { name: 'u_scale',        label: 'Scale',        min: 0.3, max: 4.0, step: 0.05, defaultValue: 1.5 },
  ]},
  { key: 'caustics',      labelKey: 'lighting.controls.caustics',     params: [
      { name: 'u_density',    label: 'Density',    min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.4 },
      { name: 'u_brightness', label: 'Brightness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_flow',       label: 'Flow',       min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'galaxy',        labelKey: 'lighting.controls.galaxy',       params: [
      { name: 'u_arms',     label: 'Arms',     min: 1,    max: 6,   step: 1,    defaultValue: 4 },
      { name: 'u_dust',     label: 'Dust',     min: 0.0,  max: 1.5, step: 0.05, defaultValue: 0.8 },
      { name: 'u_rotation', label: 'Rotation', min: 0.05, max: 2.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_stars',    label: 'Stars',    min: 0.0,  max: 2.5, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'starpath',      labelKey: 'lighting.controls.starpath',     params: [
      { name: 'u_trail',      label: 'Trail',      min: 0.1, max: 1.5, step: 0.05, defaultValue: 0.6 },
      { name: 'u_axisShift',  label: 'Axis',       min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.3 },
      { name: 'u_brightness', label: 'Brightness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'plasmaglobe',   labelKey: 'lighting.controls.plasmaglobe',  params: [
      { name: 'u_branches', label: 'Branches', min: 3,   max: 12,  step: 1,    defaultValue: 7 },
      { name: 'u_jitter',   label: 'Crackle',  min: 0.1, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_power',    label: 'Power',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'lightning',     labelKey: 'lighting.controls.lightning',    params: [
      { name: 'u_boltRate', label: 'Bolt rate', min: 0.3, max: 3.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_forks',    label: 'Forks',     min: 0,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_glow',     label: 'Glow',      min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'flowfield',     labelKey: 'lighting.controls.flowfield',    params: [
      { name: 'u_streams',     label: 'Streams', min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_flow',        label: 'Flow',    min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_colorSpread', label: 'Spread',  min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.6 },
  ]},
  { key: 'ferrofluid',    labelKey: 'lighting.controls.ferrofluid',   params: [
      { name: 'u_density',   label: 'Density',   min: 3,   max: 14,  step: 1,    defaultValue: 8 },
      { name: 'u_sharpness', label: 'Sharpness', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_motion',    label: 'Motion',    min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'liquidchrome',  labelKey: 'lighting.controls.liquidchrome', params: [
      { name: 'u_flow',      label: 'Flow',      min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_thickness', label: 'Thickness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_ripple',    label: 'Ripple',    min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'hextunnel',     labelKey: 'lighting.controls.hextunnel',    params: [
      { name: 'u_cellSize', label: 'Cell',  min: 0.05, max: 0.4, step: 0.01, defaultValue: 0.15 },
      { name: 'u_zoomRate', label: 'Zoom',  min: 0.3,  max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_neon',     label: 'Neon',  min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'mandelbrot',    labelKey: 'lighting.controls.mandelbrot',   params: [
      { name: 'u_depth',      label: 'Depth',      min: 2,    max: 6,   step: 1,    defaultValue: 4 },
      { name: 'u_rotation',   label: 'Rotation',   min: 0.05, max: 2.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_brightness', label: 'Brightness', min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'circuit',       labelKey: 'lighting.controls.circuit',      params: [
      { name: 'u_density', label: 'Density', min: 4,   max: 16,  step: 1,    defaultValue: 9 },
      { name: 'u_pulse',   label: 'Pulse',   min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_glow',    label: 'Glow',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'bokeh',         labelKey: 'lighting.controls.bokeh',        params: [
      { name: 'u_lights', label: 'Lights', min: 5,    max: 30,  step: 1,    defaultValue: 16 },
      { name: 'u_size',   label: 'Size',   min: 0.05, max: 0.3, step: 0.01, defaultValue: 0.15 },
      { name: 'u_drift',  label: 'Drift',  min: 0.1,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'sandstorm',     labelKey: 'lighting.controls.sandstorm',    params: [
      { name: 'u_wind',    label: 'Wind',    min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_density', label: 'Density', min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_gusts',   label: 'Gusts',   min: 0.1, max: 2.0, step: 0.05, defaultValue: 0.8 },
  ]},
  { key: 'dotmatrix',     labelKey: 'lighting.controls.dotmatrix',    params: [
      { name: 'u_density',    label: 'Density',    min: 8,   max: 30,  step: 1,    defaultValue: 18 },
      { name: 'u_scrollRate', label: 'Scroll',     min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_complexity', label: 'Complexity', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
  ]},
  { key: 'bubbles',       labelKey: 'lighting.controls.bubbles',      params: [
      { name: 'u_count',     label: 'Bubbles',   min: 4,   max: 24,  step: 1,    defaultValue: 12 },
      { name: 'u_rise',      label: 'Rise',      min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_irid',      label: 'Iridescence', min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.8 },
  ]},
  { key: 'silkwave',      labelKey: 'lighting.controls.silkwave',     params: [
      { name: 'u_folds',     label: 'Folds',     min: 2,   max: 12,  step: 1,    defaultValue: 6 },
      { name: 'u_flow',      label: 'Flow',      min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_sheen',     label: 'Sheen',     min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'prismwave',     labelKey: 'lighting.controls.prismwave',    params: [
      { name: 'u_bands',     label: 'Bands',     min: 1,    max: 16,   step: 1,    defaultValue: 4 },
      { name: 'u_sharpness', label: 'Sharpness', min: 1.0,  max: 10.0, step: 0.1,  defaultValue: 7 },
      { name: 'u_thickness', label: 'Thickness', min: 0.15, max: 0.95, step: 0.01, defaultValue: 0.6 },
      { name: 'u_drift',     label: 'Drift',     min: 0.1,  max: 1.2,  step: 0.02, defaultValue: 0.65 },
  ]},
  { key: 'crystaltunnel', labelKey: 'lighting.controls.crystaltunnel',params: [
      { name: 'u_facets',    label: 'Facets',    min: 3,   max: 16,  step: 1,    defaultValue: 8 },
      { name: 'u_depth',     label: 'Depth',     min: 0.4, max: 4.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_refract',   label: 'Refract',   min: 0.0, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ribbonflow',    labelKey: 'lighting.controls.ribbonflow',   params: [
      { name: 'u_ribbons',    label: 'Ribbons',    min: 2,   max: 14,  step: 1,    defaultValue: 7 },
      { name: 'u_turbulence', label: 'Turbulence', min: 0.1, max: 3.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_glow',       label: 'Glow',       min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ringtunnel',    labelKey: 'lighting.controls.ringtunnel',   params: [
      { name: 'u_rings', label: 'Rings', min: 0.5, max: 4.0, step: 0.1,  defaultValue: 2 },
      { name: 'u_zoom',  label: 'Zoom',  min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_neon',  label: 'Neon',  min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'vortextunnel',  labelKey: 'lighting.controls.vortextunnel', params: [
      { name: 'u_twist', label: 'Twist', min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_churn', label: 'Churn', min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_depth', label: 'Depth', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'helixtunnel',   labelKey: 'lighting.controls.helixtunnel',  params: [
      { name: 'u_pitch',   label: 'Pitch',   min: 1,   max: 6,   step: 0.1,  defaultValue: 3 },
      { name: 'u_strands', label: 'Strands', min: 2,   max: 4,   step: 1,    defaultValue: 2 },
      { name: 'u_glow',    label: 'Glow',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'boxtunnel',     labelKey: 'lighting.controls.boxtunnel',    params: [
      { name: 'u_depth',  label: 'Depth',  min: 0.5, max: 4.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_square', label: 'Square', min: 0.0, max: 1.0, step: 0.02, defaultValue: 1.0 },
      { name: 'u_glow',   label: 'Glow',   min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'meshgradient',  labelKey: 'lighting.controls.meshgradient', params: [
      { name: 'u_blobs',    label: 'Blobs',    min: 3,   max: 6,   step: 1,    defaultValue: 5 },
      { name: 'u_spread',   label: 'Spread',   min: 0.3, max: 1.2, step: 0.02, defaultValue: 0.8 },
      { name: 'u_softness', label: 'Softness', min: 0.3, max: 1.5, step: 0.02, defaultValue: 0.8 },
  ]},
  { key: 'tide',          labelKey: 'lighting.controls.tide',         params: [
      { name: 'u_layers', label: 'Layers',    min: 2,    max: 7,    step: 1,     defaultValue: 5 },
      { name: 'u_amp',    label: 'Height',    min: 0.02, max: 0.18, step: 0.005, defaultValue: 0.08 },
      { name: 'u_freq',   label: 'Frequency', min: 1,    max: 8,    step: 0.5,   defaultValue: 4 },
  ]},
  { key: 'vapor',         labelKey: 'lighting.controls.vapor',        params: [
      { name: 'u_density', label: 'Density', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_scale',   label: 'Scale',   min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_drift',   label: 'Drift',   min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'satinflow',     labelKey: 'lighting.controls.satinflow',    params: [
      { name: 'u_folds', label: 'Folds', min: 2,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_flow',  label: 'Flow',  min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_sheen', label: 'Sheen', min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ridgeline',     labelKey: 'lighting.controls.ridgeline',    params: [
      { name: 'u_layers', label: 'Layers', min: 2,    max: 7,    step: 1,     defaultValue: 5 },
      { name: 'u_jag',    label: 'Jag',    min: 1,    max: 8,    step: 0.1,   defaultValue: 4 },
      { name: 'u_height', label: 'Height', min: 0.05, max: 0.4,  step: 0.01,  defaultValue: 0.18 },
  ]},
  { key: 'chevron',       labelKey: 'lighting.controls.chevron',      params: [
      { name: 'u_bands', label: 'Bands', min: 4,    max: 40,  step: 1,    defaultValue: 14 },
      { name: 'u_angle', label: 'Angle', min: 0.0,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_width', label: 'Width', min: 0.05, max: 0.5, step: 0.01, defaultValue: 0.18 },
  ]},
  { key: 'terrace',       labelKey: 'lighting.controls.terrace',      params: [
      { name: 'u_levels', label: 'Levels', min: 3,   max: 16,  step: 1,    defaultValue: 8 },
      { name: 'u_scale',  label: 'Scale',  min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.4 },
      { name: 'u_line',   label: 'Lines',  min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
  ]},
  { key: 'harlequin',     labelKey: 'lighting.controls.harlequin',    params: [
      { name: 'u_cells', label: 'Cells', min: 3,   max: 20,  step: 1,    defaultValue: 8 },
      { name: 'u_skew',  label: 'Skew',  min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_shift', label: 'Shift', min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'mosaic',        labelKey: 'lighting.controls.mosaic',       params: [
      { name: 'u_cells', label: 'Cells', min: 3,   max: 18,  step: 1,    defaultValue: 9 },
      { name: 'u_wave',  label: 'Wave',  min: 0.5, max: 4.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_pop',   label: 'Pop',   min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.7 },
  ]},
  { key: 'spectrumbars',   labelKey: 'lighting.controls.spectrumbars',   audio: true, params: [
      { name: 'u_bars',       label: 'Bars',            min: 8,   max: 16,  step: 1,    defaultValue: 16 },
      { name: 'u_gap',        label: 'Gap',             min: 0.0, max: 0.3, step: 0.01, defaultValue: 0.12 },
      { name: 'u_glow',       label: 'Glow',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'spectrumradial', labelKey: 'lighting.controls.spectrumradial', audio: true, params: [
      { name: 'u_spokes',     label: 'Spokes',          min: 16,  max: 64,  step: 1,    defaultValue: 32 },
      { name: 'u_radius',     label: 'Core',            min: 0.0, max: 0.4, step: 0.01, defaultValue: 0.1 },
      { name: 'u_glow',       label: 'Glow',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'scope',          labelKey: 'lighting.controls.scope',          audio: true, params: [
      { name: 'u_thickness',  label: 'Thickness',       min: 0.002, max: 0.04, step: 0.001, defaultValue: 0.012 },
      { name: 'u_harmonics',  label: 'Layers',          min: 1,     max: 5,    step: 1,     defaultValue: 3 },
      { name: 'u_glow',       label: 'Glow',            min: 0.3,   max: 2.0,  step: 0.05,  defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,     max: 2,    step: 0.05,  defaultValue: 1.0 },
  ]},
  { key: 'basspulse',      labelKey: 'lighting.controls.basspulse',      audio: true, params: [
      { name: 'u_rings',      label: 'Rings',           min: 1,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_ringSpeed',  label: 'Speed',           min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_halo',       label: 'Halo',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'beatstrobe',     labelKey: 'lighting.controls.beatstrobe',     audio: true, params: [
      { name: 'u_stripes',    label: 'Stripes',         min: 3,   max: 16,  step: 1,    defaultValue: 7 },
      { name: 'u_flash',      label: 'Flash',           min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_chroma',     label: 'Chroma',          min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'harmonicstar',   labelKey: 'lighting.controls.harmonicstar',   audio: true, params: [
      { name: 'u_points',     label: 'Points',          min: 6,   max: 16,  step: 1,    defaultValue: 12 },
      { name: 'u_core',       label: 'Core',            min: 0.05, max: 0.3, step: 0.01, defaultValue: 0.1 },
      { name: 'u_flare',      label: 'Flare',           min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'audiotunnel',    labelKey: 'lighting.controls.audiotunnel',    audio: true, params: [
      { name: 'u_ringDensity', label: 'Rings',          min: 3,   max: 12,  step: 1,    defaultValue: 6 },
      { name: 'u_twist',       label: 'Twist',          min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_neon',        label: 'Neon',           min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost',  label: 'Audio Intensity', min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'bassbloom',      labelKey: 'lighting.controls.bassbloom',      audio: true, params: [
      { name: 'u_petals',     label: 'Petals',          min: 4,    max: 12,  step: 1,    defaultValue: 7 },
      { name: 'u_shimmer',    label: 'Shimmer',         min: 0.0,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_bloomSize',  label: 'Size',            min: 0.1,  max: 0.8, step: 0.02, defaultValue: 0.4 },
      { name: 'u_audioBoost', label: 'Audio Intensity',  min: 0,    max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
];

export function defaultParamsFor(key: string): Record<string, number> {
  const def = EFFECTS.find(e => e.key === key);
  if (!def) return {};
  const p: Record<string, number> = {};
  for (const pd of def.params) { p[pd.name] = pd.defaultValue; }
  return p;
}

export function defaultStateFor(key: string): EffectState {
  return { ...BASE_DEFAULTS, params: defaultParamsFor(key) };
}

/**
 * Number of quick-access template slots exposed per effect in the drawer.
 * Kept low (4) so the button row stays scannable and the default catalogue
 * is tractable to hand-author.
 */
export const TEMPLATE_COUNT = 4;

/** Per-effect slot store. One of `slots[selected]` is the state currently */
/** driving the engine; the other 3 are off-screen variations the user can */
/** switch to instantly. All 4 round-trip through NexusSettings. */
export interface EffectTemplateBundle {
  selected: number;
  slots: EffectState[];
}
