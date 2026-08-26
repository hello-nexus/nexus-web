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
  label: string;  // display label (or i18n key when labelKey is set)
  labelKey?: string; // i18n key; when present the UI calls t(labelKey) instead of using label directly
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** When present the control renders as a segmented choice; value is still a float. */
  options?: { value: number; labelKey: string }[];
  /** Render the slider with a centre zero tick (bipolar look, like Speed). */
  zeroMarker?: boolean;
}

export type EffectCategory =
  | 'simple'
  | 'gradient'
  | 'twotone'
  | 'spectrum'
  | 'audio'
  | 'cosmic'
  | 'organic'
  | 'geometric'
  | 'pattern';

// Section order for the effect listing: simple fills first, then organic, then
// the rest, with the audio-reactive set last.
export const EFFECT_CATEGORIES: EffectCategory[] = [
  'simple', 'gradient', 'twotone', 'spectrum',
  'organic', 'cosmic', 'geometric', 'pattern', 'audio',
];

// The "simple" family: one cheap solid-fill shader (simple.frag) reused for
// every colour. The colour is driven entirely by the post-process tint
// (hue / colorize / saturation), so each entry differs only by its template
// feels - see SIMPLE_COLORS / buildDefaultTemplates in lightingTemplates.ts.
export const SIMPLE_EFFECT_KEYS = [
  'simplewhite', 'simplesoftpink', 'simplepink', 'simplered',
  'simpleorange', 'simpleyellow', 'simplegreen', 'simpledarkgreen',
  'simplecyan', 'simpleblue', 'simpleviolet',
] as const;

/** A per-effect colour the user picks with the wheel. Each maps to an HSV
 *  triple carried in `params` as u_<id>Hue / u_<id>Sat / u_<id>Val. */
export interface EffectColorSlot {
  id: 'a' | 'b' | 'c' | 'd';
  labelKey: string;
  defaultHue: number;
  defaultSat: number;
  defaultVal: number;
}

export interface EffectDef {
  key: string;
  labelKey: string;
  /** Static patterns own their colours instead of using the global tint. */
  colors?: EffectColorSlot[];
  /** Computed via {@link categoryOf} - the EFFECT_CATEGORY map below is the source of truth. */
  category?: EffectCategory;
  params: EffectParamDef[];
  showIntensity?: boolean;
  audio?: boolean;
  /** When true, the Speed slider is hidden for this effect. */
  hideSpeed?: boolean;
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
  // Simple solid-colour fills.
  simplewhite: 'simple', simplesoftpink: 'simple', simplepink: 'simple',
  simplered: 'simple', simpleorange: 'simple', simpleyellow: 'simple',
  simplegreen: 'simple', simpledarkgreen: 'simple',
  simplecyan: 'simple', simpleblue: 'simple', simpleviolet: 'simple',
  gradientlinear: 'gradient', gradientradial: 'gradient', gradienttri: 'gradient',
  gradientconic: 'gradient', mirror: 'gradient', corners: 'gradient',
  splitsharp: 'twotone', stripes: 'twotone', checker: 'twotone', border: 'twotone',
  rings: 'twotone', dots: 'twotone', wedges: 'twotone',
  spectrumramp: 'spectrum', spectrumbands: 'spectrum', huewheel: 'spectrum',
  // Audio-reactive set (13).
  spectrumbars: 'audio', spectrumradial: 'audio', scope: 'audio',
  basspulse: 'audio', beatstrobe: 'audio', harmonicstar: 'audio',
  audiotunnel: 'audio', bassbloom: 'audio', beatbuilder: 'audio',
  spectrumaurora: 'audio', neonwaveform: 'audio', liquidbeat: 'audio',
  beatburst: 'audio',
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
  { key: 'static', labelKey: 'lighting.mode.static' },
  { key: 'animate', labelKey: 'lighting.mode.animate' },
  { key: 'gif', labelKey: 'lighting.mode.gif' },
  { key: 'screen', labelKey: 'lighting.mode.screen' },
  { key: 'gamesync', labelKey: 'lighting.mode.gamesync' },
];

// Simple fills expose a bipolar hue nudge and a colour-temperature (warmth)
// slider. White carries warmth only - a hue nudge is invisible on white. One
// shared array per group since every simple colour is the same shader; they're
// read-only so sharing the reference is safe.
const SIMPLE_COLOR_PARAMS: EffectParamDef[] = [
  { name: 'u_hueShift', label: 'Hue shift', labelKey: 'lighting.controls.param.hueShift', min: -1, max: 1, step: 0.01, defaultValue: 0, zeroMarker: true },
  { name: 'u_warmth',   label: 'Warmth', labelKey: 'lighting.controls.param.warmth', min: -1, max: 1, step: 0.01, defaultValue: 0, zeroMarker: true },
];
const SIMPLE_WHITE_PARAMS: EffectParamDef[] = [
  { name: 'u_warmth', label: 'Warmth', labelKey: 'lighting.controls.param.warmth', min: -1, max: 1, step: 0.01, defaultValue: 0, zeroMarker: true },
];

export const EFFECTS: EffectDef[] = [
  // Simple solid-colour fills lead the list. A flat swatch with a slight
  // hue-shift nudge is the only per-effect tweak; base colour / saturation /
  // contrast come from the template feels. No speed (the fill is static).
  { key: 'simplewhite',     labelKey: 'lighting.controls.simplewhite',     hideSpeed: true, params: SIMPLE_WHITE_PARAMS },
  { key: 'simplesoftpink',  labelKey: 'lighting.controls.simplesoftpink',  hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simplepink',      labelKey: 'lighting.controls.simplepink',      hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simplered',       labelKey: 'lighting.controls.simplered',       hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simpleorange',    labelKey: 'lighting.controls.simpleorange',    hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simpleyellow',    labelKey: 'lighting.controls.simpleyellow',    hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simplegreen',     labelKey: 'lighting.controls.simplegreen',     hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simpledarkgreen', labelKey: 'lighting.controls.simpledarkgreen', hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simplecyan',      labelKey: 'lighting.controls.simplecyan',      hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simpleblue',      labelKey: 'lighting.controls.simpleblue',      hideSpeed: true, params: SIMPLE_COLOR_PARAMS },
  { key: 'simpleviolet',    labelKey: 'lighting.controls.simpleviolet',    hideSpeed: true, params: SIMPLE_COLOR_PARAMS },

// ── Static patterns ────────────────────────────────────────────────────────
// Purpose-built for Static mode: a pure function of position, no clock at all,
// and their own colours rather than the global tint. Param defaults mirror
// DefaultParamsFor in nexus-service/src/Lighting/LightingProvider.cs.
  { key: 'gradientlinear', labelKey: 'lighting.controls.gradientlinear', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.58, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.88, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_midpoint', label: 'Midpoint', labelKey: 'lighting.controls.param.midpoint', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  ]},
  { key: 'gradientradial', labelKey: 'lighting.controls.gradientradial', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.12, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.75, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_radius', label: 'Size', labelKey: 'lighting.controls.param.size', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.8 },
  ]},
  { key: 'gradienttri', labelKey: 'lighting.controls.gradienttri', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.33, defaultSat: 1, defaultVal: 1 }, { id: 'c', labelKey: 'lighting.controls.color3', defaultHue: 0.62, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_midpoint', label: 'Midpoint', labelKey: 'lighting.controls.param.midpoint', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  ]},
  { key: 'gradientconic', labelKey: 'lighting.controls.gradientconic', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.55, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.92, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_offset', label: 'Rotation', labelKey: 'lighting.controls.param.rotation', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  ]},
  { key: 'mirror', labelKey: 'lighting.controls.mirror', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.02, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.6, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.6 },
  ]},
  { key: 'corners', labelKey: 'lighting.controls.corners', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.15, defaultSat: 1, defaultVal: 1 }, { id: 'c', labelKey: 'lighting.controls.color3', defaultHue: 0.55, defaultSat: 1, defaultVal: 1 }, { id: 'd', labelKey: 'lighting.controls.color4', defaultHue: 0.8, defaultSat: 1, defaultVal: 1 }], params: [] },
  { key: 'splitsharp', labelKey: 'lighting.controls.splitsharp', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.62, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_position', label: 'Position', labelKey: 'lighting.controls.param.position', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  ]},
  { key: 'stripes', labelKey: 'lighting.controls.stripes', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.58, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count', min: 1, max: 10, step: 1, defaultValue: 3 },
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.02 },
    { name: 'u_balance', label: 'Balance', labelKey: 'lighting.controls.param.balance', min: 0.05, max: 0.95, step: 0.01, defaultValue: 0.5 },
  ]},
  { key: 'checker', labelKey: 'lighting.controls.checker', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 0, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size', min: 2, max: 10, step: 1, defaultValue: 4 },
  ]},
  { key: 'border', labelKey: 'lighting.controls.border', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 0, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.55, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness', min: 0.02, max: 0.5, step: 0.01, defaultValue: 0.18 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.05 },
  ]},
  { key: 'rings', labelKey: 'lighting.controls.rings', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.55, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.88, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count', min: 1, max: 8, step: 1, defaultValue: 3 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.05 },
  ]},
  { key: 'dots', labelKey: 'lighting.controls.dots', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0.12, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.62, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_spacing', label: 'Gap', labelKey: 'lighting.controls.param.gap', min: 2, max: 10, step: 1, defaultValue: 4 },
    { name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size', min: 0.1, max: 0.5, step: 0.01, defaultValue: 0.36 },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0, max: 1, step: 0.01, defaultValue: 0.1 },
  ]},
  { key: 'wedges', labelKey: 'lighting.controls.wedges', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }, { id: 'b', labelKey: 'lighting.controls.color2', defaultHue: 0.5, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count', min: 1, max: 10, step: 1, defaultValue: 4 },
    { name: 'u_offset', label: 'Rotation', labelKey: 'lighting.controls.param.rotation', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  ]},
  { key: 'spectrumramp', labelKey: 'lighting.controls.spectrumramp', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
    { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 0.2, max: 4, step: 0.05, defaultValue: 1 },
  ]},
  { key: 'spectrumbands', labelKey: 'lighting.controls.spectrumbands', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count', min: 2, max: 10, step: 1, defaultValue: 5 },
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0, max: 360, step: 5, defaultValue: 0 },
  ]},
  { key: 'huewheel', labelKey: 'lighting.controls.huewheel', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1', defaultHue: 0, defaultSat: 1, defaultVal: 1 }], params: [] },
  { key: 'plasma',       labelKey: 'lighting.controls.plasma',       params: [
      { name: 'u_warp', label: 'Warp', labelKey: 'lighting.controls.param.warp',  min: 0,   max: 2,   step: 0.05, defaultValue: 1 },
      { name: 'u_zoom', label: 'Zoom', labelKey: 'lighting.controls.param.zoom',  min: 0.5, max: 3,   step: 0.05, defaultValue: 1 },
  ]},
  { key: 'fire',         labelKey: 'lighting.controls.fire',         params: [{ name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence', min: 1, max: 3, step: 0.05, defaultValue: 1.6 }] },
  { key: 'rainbow',     labelKey: 'lighting.controls.rainbow',     params: [
      { name: 'u_density',  label: 'Density', labelKey: 'lighting.controls.param.density',  min: 0.2, max: 3,   step: 0.05, defaultValue: 1 },
      { name: 'u_rotation', label: 'Rotation', labelKey: 'lighting.controls.param.rotation', min: 0,   max: 360, step: 5,    defaultValue: 0 },
  ]},
  { key: 'spiral',       labelKey: 'lighting.controls.spiral',       params: [
      { name: 'u_arms',      label: 'Arms', labelKey: 'lighting.controls.param.arms',      min: 1, max: 10, step: 1,   defaultValue: 5 },
      { name: 'u_tightness', label: 'Tightness', labelKey: 'lighting.controls.param.tightness', min: 2, max: 16, step: 0.5, defaultValue: 8 },
  ]},
  { key: 'matrix',       labelKey: 'lighting.controls.matrix',       params: [
      { name: 'u_columns', label: 'Columns', labelKey: 'lighting.controls.param.columns', min: 8, max: 60, step: 1, defaultValue: 28 },
      { name: 'u_fade',    label: 'Fade', labelKey: 'lighting.controls.param.fade',    min: 1, max: 12, step: 0.5, defaultValue: 4 },
  ]},
  { key: 'meteor',       labelKey: 'lighting.controls.meteor',       params: [
      { name: 'u_streaks', label: 'Streaks', labelKey: 'lighting.controls.param.streaks', min: 1,    max: 16,  step: 1,    defaultValue: 6 },
      { name: 'u_width',   label: 'Size', labelKey: 'lighting.controls.param.size',    min: 0.03, max: 0.3, step: 0.005, defaultValue: 0.13 },
  ]},
  { key: 'ripple',       labelKey: 'lighting.controls.ripple',       params: [{ name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency', min: 3, max: 30, step: 0.5, defaultValue: 12 }] },
  { key: 'wave',         labelKey: 'lighting.controls.wave',         params: [
      { name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency', min: 2,    max: 16,   step: 0.5, defaultValue: 8 },
      { name: 'u_amp',  label: 'Amplitude', labelKey: 'lighting.controls.param.amplitude', min: 0.05, max: 0.4, step: 0.01, defaultValue: 0.18 },
  ]},
  { key: 'gradientwave', labelKey: 'lighting.controls.gradientwave', params: [{ name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency', min: 2, max: 18, step: 0.5, defaultValue: 6 }] },
  { key: 'ball',         labelKey: 'lighting.controls.ball',         params: [
      { name: 'u_count', label: 'Ball count', labelKey: 'lighting.controls.param.ballCount', min: 1,    max: 24,  step: 1,    defaultValue: 8 },
      { name: 'u_size',  label: 'Size', labelKey: 'lighting.controls.param.size',       min: 0.03, max: 0.25, step: 0.005, defaultValue: 0.08 },
  ]},
  { key: 'radar',        labelKey: 'lighting.controls.radar',        params: [{ name: 'u_ringRate', label: 'Ring rate', labelKey: 'lighting.controls.param.ringRate', min: 0.05, max: 1, step: 0.02, defaultValue: 0.25 }] },
  { key: 'pulse',        labelKey: 'lighting.controls.pulse',        showIntensity: true, params: [{ name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size', min: 0.4, max: 1.8, step: 0.02, defaultValue: 1.2 }] },
  { key: 'watercolor',  labelKey: 'lighting.controls.watercolor',  params: [
      { name: 'u_blobs',    label: 'Blobs', labelKey: 'lighting.controls.param.blobs',    min: 2,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0.1, max: 1.0, step: 0.02, defaultValue: 0.5 },
  ]},
  { key: 'jellyfish',   labelKey: 'lighting.controls.jellyfish',   params: [
      { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count', min: 1,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_glow',  label: 'Glow', labelKey: 'lighting.controls.param.glow',  min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'aurora',       labelKey: 'lighting.controls.aurora',       params: [
      { name: 'u_curtains', label: 'Curtains', labelKey: 'lighting.controls.param.curtains', min: 1,   max: 8,   step: 1,    defaultValue: 4 },
      { name: 'u_height',   label: 'Height', labelKey: 'lighting.controls.param.height',   min: 0.2, max: 1.0, step: 0.02, defaultValue: 0.55 },
      { name: 'u_shimmer',  label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer',  min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.5 },
  ]},
  { key: 'lavalamp',     labelKey: 'lighting.controls.lavalamp',     params: [
      { name: 'u_count',     label: 'Blobs', labelKey: 'lighting.controls.param.blobs',     min: 2,    max: 10,  step: 1,    defaultValue: 5 },
      { name: 'u_viscosity', label: 'Viscosity', labelKey: 'lighting.controls.param.viscosity', min: 0.1,  max: 1.0, step: 0.02, defaultValue: 0.45 },
      { name: 'u_size',      label: 'Size', labelKey: 'lighting.controls.param.size',      min: 0.08, max: 0.5, step: 0.01, defaultValue: 0.22 },
  ]},
  { key: 'starfield',    labelKey: 'lighting.controls.starfield',    params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density',     min: 8,   max: 60, step: 1,    defaultValue: 45 },
      { name: 'u_layers',  label: 'Depth layers', labelKey: 'lighting.controls.param.depthLayers', min: 1,  max: 8,  step: 1,    defaultValue: 5 },
      { name: 'u_trail',   label: 'Trail', labelKey: 'lighting.controls.param.trail',       min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'voronoi',      labelKey: 'lighting.controls.voronoi',      params: [
      { name: 'u_scale',     label: 'Scale', labelKey: 'lighting.controls.param.scale',       min: 1.0, max: 6.0, step: 0.1,  defaultValue: 3 },
      { name: 'u_edgeWidth', label: 'Edge width', labelKey: 'lighting.controls.param.edgeWidth',  min: 0.01, max: 0.15, step: 0.005, defaultValue: 0.05 },
      { name: 'u_drift',     label: 'Drift', labelKey: 'lighting.controls.param.drift',       min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'neonrain',     labelKey: 'lighting.controls.neonrain',     params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 12,   max: 80,  step: 1,    defaultValue: 28 },
      { name: 'u_length',  label: 'Length', labelKey: 'lighting.controls.param.length',  min: 0.03, max: 0.5, step: 0.01, defaultValue: 0.30 },
      { name: 'u_splash',  label: 'Splash', labelKey: 'lighting.controls.param.splash',  min: 0.0,  max: 1.0, step: 0.02, defaultValue: 0.85 },
  ]},
  { key: 'nebula',        labelKey: 'lighting.controls.nebula',       params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_stars',   label: 'Stars', labelKey: 'lighting.controls.param.stars',   min: 0.0, max: 1.0, step: 0.02, defaultValue: 0.6 },
      { name: 'u_depth',   label: 'Layers', labelKey: 'lighting.controls.param.layers',  min: 1,   max: 6,   step: 1,    defaultValue: 4 },
  ]},
  { key: 'bursts',        labelKey: 'lighting.controls.bursts',       params: [
      { name: 'u_rate',      label: 'Rate', labelKey: 'lighting.controls.param.rate',      min: 0.2, max: 6.0, step: 0.1,  defaultValue: 1.8 },
      { name: 'u_particles', label: 'Particles', labelKey: 'lighting.controls.param.particles', min: 3,   max: 20,  step: 1,    defaultValue: 14 },
      { name: 'u_size',      label: 'Size', labelKey: 'lighting.controls.param.size',      min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.1 },
  ]},
  { key: 'lavafissure',   labelKey: 'lighting.controls.lavafissure',  params: [
      { name: 'u_flow',       label: 'Flow', labelKey: 'lighting.controls.param.flow',     min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_crackWidth', label: 'Cracks', labelKey: 'lighting.controls.param.cracks',   min: 0.1, max: 0.9, step: 0.02, defaultValue: 0.35 },
      { name: 'u_shimmer',    label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer',  min: 0.0, max: 1.5, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'kaleidoscope',  labelKey: 'lighting.controls.kaleidoscope', params: [
      { name: 'u_sides', label: 'Sides', labelKey: 'lighting.controls.param.sides', min: 3,   max: 12,  step: 1,    defaultValue: 8 },
      { name: 'u_spin',  label: 'Spin', labelKey: 'lighting.controls.param.spin',  min: -2,  max: 2,   step: 0.05, defaultValue: 0.4 },
      { name: 'u_inner', label: 'Detail', labelKey: 'lighting.controls.param.detail', min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'wormhole',      labelKey: 'lighting.controls.wormhole',     params: [
      { name: 'u_depth', label: 'Depth', labelKey: 'lighting.controls.param.depth', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_rings', label: 'Rings', labelKey: 'lighting.controls.param.rings', min: 2,   max: 16,  step: 1,    defaultValue: 5 },
      { name: 'u_twist', label: 'Twist', labelKey: 'lighting.controls.param.twist', min: -2,  max: 2,   step: 0.05, defaultValue: 0.6 },
  ]},
  { key: 'interference',  labelKey: 'lighting.controls.interference', params: [
      { name: 'u_wavelength', label: 'Wavelength', labelKey: 'lighting.controls.param.wavelength', min: 0.05, max: 1.0, step: 0.01, defaultValue: 0.22 },
      { name: 'u_sources',    label: 'Sources', labelKey: 'lighting.controls.param.sources',    min: 2,    max: 8,   step: 1,    defaultValue: 5 },
  ]},
  { key: 'sacredgeometry', labelKey: 'lighting.controls.sacredgeometry', params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers', min: 2,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_edge',   label: 'Edge', labelKey: 'lighting.controls.param.edge',   min: 0.2, max: 1.2, step: 0.02, defaultValue: 0.6 },
      { name: 'u_pulse',  label: 'Pulse', labelKey: 'lighting.controls.param.pulse',  min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'tessellation',  labelKey: 'lighting.controls.tessellation', params: [
      { name: 'u_shape', label: 'Shape', labelKey: 'lighting.controls.param.shape', min: 0,    max: 2,   step: 1,    defaultValue: 0 },
      { name: 'u_morph', label: 'Morph', labelKey: 'lighting.controls.param.morph', min: 0.0,  max: 1.3, step: 0.02, defaultValue: 0.6 },
      { name: 'u_edge',  label: 'Edge', labelKey: 'lighting.controls.param.edge',  min: 0.02, max: 0.35, step: 0.01, defaultValue: 0.15 },
  ]},
  { key: 'domainwarp',    labelKey: 'lighting.controls.domainwarp',   params: [
      { name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence', min: 0.2, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_direction',  label: 'Direction', labelKey: 'lighting.controls.param.direction',  min: -3.14, max: 3.14, step: 0.05, defaultValue: 0 },
      { name: 'u_bite',       label: 'Bite', labelKey: 'lighting.controls.param.bite',       min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'inkbloom',      labelKey: 'lighting.controls.inkbloom',     params: [
      { name: 'u_spread', label: 'Spread', labelKey: 'lighting.controls.param.spread', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_curl',   label: 'Curl', labelKey: 'lighting.controls.param.curl',   min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.6 },
      { name: 'u_fade',   label: 'Fade', labelKey: 'lighting.controls.param.fade',   min: 0.3, max: 3.0, step: 0.05, defaultValue: 0.7 },
  ]},
  { key: 'cosmicdust',    labelKey: 'lighting.controls.cosmicdust',   params: [
      { name: 'u_particles', label: 'Density', labelKey: 'lighting.controls.param.density', min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.8 },
      { name: 'u_twinkle',   label: 'Twinkle', labelKey: 'lighting.controls.param.twinkle', min: 0.2, max: 4.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_parallax',  label: 'Parallax', labelKey: 'lighting.controls.param.parallax', min: 0.0, max: 1.2, step: 0.02, defaultValue: 0.6 },
  ]},
  { key: 'chromaspiral',  labelKey: 'lighting.controls.chromaspiral', params: [
      { name: 'u_tightness', label: 'Tightness', labelKey: 'lighting.controls.param.tightness', min: 1.0, max: 12.0, step: 0.1, defaultValue: 5.0 },
      { name: 'u_spin',      label: 'Spin', labelKey: 'lighting.controls.param.spin',      min: -3.0, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_bands',     label: 'Bands', labelKey: 'lighting.controls.param.bands',     min: 1,    max: 12,   step: 1,    defaultValue: 3 },
  ]},
  { key: 'neongrid',      labelKey: 'lighting.controls.neongrid',     params: [
      { name: 'u_density', label: 'Cells', labelKey: 'lighting.controls.param.cells',  min: 3,   max: 30,  step: 1,    defaultValue: 12 },
      { name: 'u_pulse',   label: 'Pulse', labelKey: 'lighting.controls.param.pulse',  min: 0.0, max: 2.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow',   min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'oilslick',      labelKey: 'lighting.controls.oilslick',     params: [
      { name: 'u_flow',         label: 'Flow', labelKey: 'lighting.controls.param.flow',         min: 0.1, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_iridescence',  label: 'Iridescence', labelKey: 'lighting.controls.param.iridescence',  min: 0.3, max: 4.0, step: 0.05, defaultValue: 2.5 },
      { name: 'u_scale',        label: 'Scale', labelKey: 'lighting.controls.param.scale',        min: 0.3, max: 4.0, step: 0.05, defaultValue: 1.5 },
  ]},
  { key: 'caustics',      labelKey: 'lighting.controls.caustics',     params: [
      { name: 'u_density',    label: 'Density', labelKey: 'lighting.controls.param.density',    min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.4 },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_flow',       label: 'Flow', labelKey: 'lighting.controls.param.flow',       min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'galaxy',        labelKey: 'lighting.controls.galaxy',       params: [
      { name: 'u_arms',     label: 'Arms', labelKey: 'lighting.controls.param.arms',     min: 1,    max: 6,   step: 1,    defaultValue: 4 },
      { name: 'u_dust',     label: 'Dust', labelKey: 'lighting.controls.param.dust',     min: 0.0,  max: 1.5, step: 0.05, defaultValue: 0.8 },
      { name: 'u_rotation', label: 'Rotation', labelKey: 'lighting.controls.param.rotation', min: 0.05, max: 2.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_stars',    label: 'Stars', labelKey: 'lighting.controls.param.stars',    min: 0.0,  max: 2.5, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'starpath',      labelKey: 'lighting.controls.starpath',     params: [
      { name: 'u_trail',      label: 'Trail', labelKey: 'lighting.controls.param.trail',      min: 0.1, max: 1.5, step: 0.05, defaultValue: 0.6 },
      { name: 'u_axisShift',  label: 'Axis', labelKey: 'lighting.controls.param.axis',       min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.3 },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'plasmaglobe',   labelKey: 'lighting.controls.plasmaglobe',  params: [
      { name: 'u_branches', label: 'Branches', labelKey: 'lighting.controls.param.branches', min: 3,   max: 12,  step: 1,    defaultValue: 7 },
      { name: 'u_jitter',   label: 'Crackle', labelKey: 'lighting.controls.param.crackle',  min: 0.1, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_power',    label: 'Power', labelKey: 'lighting.controls.param.power',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'lightning',     labelKey: 'lighting.controls.lightning',    params: [
      { name: 'u_boltRate', label: 'Bolt rate', labelKey: 'lighting.controls.param.boltRate', min: 0.3, max: 3.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_forks',    label: 'Forks', labelKey: 'lighting.controls.param.forks',     min: 0,   max: 6,   step: 1,    defaultValue: 3 },
      { name: 'u_glow',     label: 'Glow', labelKey: 'lighting.controls.param.glow',      min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'flowfield',     labelKey: 'lighting.controls.flowfield',    params: [
      { name: 'u_streams',     label: 'Streams', labelKey: 'lighting.controls.param.streams', min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_flow',        label: 'Flow', labelKey: 'lighting.controls.param.flow',    min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_colorSpread', label: 'Spread', labelKey: 'lighting.controls.param.spread',  min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.6 },
  ]},
  { key: 'ferrofluid',    labelKey: 'lighting.controls.ferrofluid',   params: [
      { name: 'u_density',   label: 'Density', labelKey: 'lighting.controls.param.density',   min: 3,   max: 14,  step: 1,    defaultValue: 8 },
      { name: 'u_sharpness', label: 'Sharpness', labelKey: 'lighting.controls.param.sharpness', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_motion',    label: 'Motion', labelKey: 'lighting.controls.param.motion',    min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'liquidchrome',  labelKey: 'lighting.controls.liquidchrome', params: [
      { name: 'u_flow',      label: 'Flow', labelKey: 'lighting.controls.param.flow',      min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_ripple',    label: 'Ripple', labelKey: 'lighting.controls.param.ripple',    min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'hextunnel',     labelKey: 'lighting.controls.hextunnel',    params: [
      { name: 'u_cellSize', label: 'Cell', labelKey: 'lighting.controls.param.cell',  min: 0.05, max: 0.4, step: 0.01, defaultValue: 0.15 },
      { name: 'u_zoomRate', label: 'Zoom', labelKey: 'lighting.controls.param.zoom',  min: 0.3,  max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_neon',     label: 'Neon', labelKey: 'lighting.controls.param.neon',  min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'mandelbrot',    labelKey: 'lighting.controls.mandelbrot',   params: [
      { name: 'u_depth',      label: 'Depth', labelKey: 'lighting.controls.param.depth',      min: 2,    max: 6,   step: 1,    defaultValue: 4 },
      { name: 'u_rotation',   label: 'Rotation', labelKey: 'lighting.controls.param.rotation',   min: 0.05, max: 2.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness', min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'circuit',       labelKey: 'lighting.controls.circuit',      params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 4,   max: 16,  step: 1,    defaultValue: 9 },
      { name: 'u_pulse',   label: 'Pulse', labelKey: 'lighting.controls.param.pulse',   min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'bokeh',         labelKey: 'lighting.controls.bokeh',        params: [
      { name: 'u_lights', label: 'Lights', labelKey: 'lighting.controls.param.lights', min: 5,    max: 30,  step: 1,    defaultValue: 16 },
      { name: 'u_size',   label: 'Size', labelKey: 'lighting.controls.param.size',   min: 0.05, max: 0.3, step: 0.01, defaultValue: 0.15 },
      { name: 'u_drift',  label: 'Drift', labelKey: 'lighting.controls.param.drift',  min: 0.1,  max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'sandstorm',     labelKey: 'lighting.controls.sandstorm',    params: [
      { name: 'u_wind',    label: 'Wind', labelKey: 'lighting.controls.param.wind',    min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_gusts',   label: 'Gusts', labelKey: 'lighting.controls.param.gusts',   min: 0.1, max: 2.0, step: 0.05, defaultValue: 0.8 },
  ]},
  { key: 'dotmatrix',     labelKey: 'lighting.controls.dotmatrix',    params: [
      { name: 'u_density',    label: 'Density', labelKey: 'lighting.controls.param.density',    min: 8,   max: 30,  step: 1,    defaultValue: 18 },
      { name: 'u_scrollRate', label: 'Scroll', labelKey: 'lighting.controls.param.scroll',     min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_complexity', label: 'Complexity', labelKey: 'lighting.controls.param.complexity', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
  ]},
  { key: 'bubbles',       labelKey: 'lighting.controls.bubbles',      params: [
      { name: 'u_count',     label: 'Bubbles', labelKey: 'lighting.controls.param.bubbles',   min: 4,   max: 24,  step: 1,    defaultValue: 12 },
      { name: 'u_rise',      label: 'Rise', labelKey: 'lighting.controls.param.rise',      min: 0.2, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_irid',      label: 'Iridescence', labelKey: 'lighting.controls.param.iridescence', min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.8 },
  ]},
  { key: 'silkwave',      labelKey: 'lighting.controls.silkwave',     params: [
      { name: 'u_folds',     label: 'Folds', labelKey: 'lighting.controls.param.folds',     min: 2,   max: 12,  step: 1,    defaultValue: 6 },
      { name: 'u_flow',      label: 'Flow', labelKey: 'lighting.controls.param.flow',      min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_sheen',     label: 'Sheen', labelKey: 'lighting.controls.param.sheen',     min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'prismwave',     labelKey: 'lighting.controls.prismwave',    params: [
      { name: 'u_bands',     label: 'Bands', labelKey: 'lighting.controls.param.bands',     min: 1,    max: 16,   step: 1,    defaultValue: 4 },
      { name: 'u_sharpness', label: 'Sharpness', labelKey: 'lighting.controls.param.sharpness', min: 1.0,  max: 10.0, step: 0.1,  defaultValue: 7 },
      { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness', min: 0.15, max: 0.95, step: 0.01, defaultValue: 0.6 },
      { name: 'u_drift',     label: 'Drift', labelKey: 'lighting.controls.param.drift',     min: 0.1,  max: 1.2,  step: 0.02, defaultValue: 0.65 },
  ]},
  { key: 'crystaltunnel', labelKey: 'lighting.controls.crystaltunnel',params: [
      { name: 'u_facets',    label: 'Facets', labelKey: 'lighting.controls.param.facets',    min: 3,   max: 16,  step: 1,    defaultValue: 8 },
      { name: 'u_depth',     label: 'Depth', labelKey: 'lighting.controls.param.depth',     min: 0.4, max: 4.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_refract',   label: 'Refract', labelKey: 'lighting.controls.param.refract',   min: 0.0, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ribbonflow',    labelKey: 'lighting.controls.ribbonflow',   params: [
      { name: 'u_ribbons',    label: 'Ribbons', labelKey: 'lighting.controls.param.ribbons',    min: 2,   max: 14,  step: 1,    defaultValue: 7 },
      { name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence', min: 0.1, max: 3.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',       min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ringtunnel',    labelKey: 'lighting.controls.ringtunnel',   params: [
      { name: 'u_rings', label: 'Rings', labelKey: 'lighting.controls.param.rings', min: 0.5, max: 4.0, step: 0.1,  defaultValue: 2 },
      { name: 'u_zoom',  label: 'Zoom', labelKey: 'lighting.controls.param.zoom',  min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_neon',  label: 'Neon', labelKey: 'lighting.controls.param.neon',  min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'vortextunnel',  labelKey: 'lighting.controls.vortextunnel', params: [
      { name: 'u_twist', label: 'Twist', labelKey: 'lighting.controls.param.twist', min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_churn', label: 'Churn', labelKey: 'lighting.controls.param.churn', min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_depth', label: 'Depth', labelKey: 'lighting.controls.param.depth', min: 0.4, max: 3.0, step: 0.05, defaultValue: 1.2 },
  ]},
  { key: 'helixtunnel',   labelKey: 'lighting.controls.helixtunnel',  params: [
      { name: 'u_pitch',   label: 'Pitch', labelKey: 'lighting.controls.param.pitch',   min: 1,   max: 6,   step: 0.1,  defaultValue: 3 },
      { name: 'u_strands', label: 'Strands', labelKey: 'lighting.controls.param.strands', min: 2,   max: 4,   step: 1,    defaultValue: 2 },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow',    min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'boxtunnel',     labelKey: 'lighting.controls.boxtunnel',    params: [
      { name: 'u_depth',  label: 'Depth', labelKey: 'lighting.controls.param.depth',  min: 0.5, max: 4.0, step: 0.05, defaultValue: 1.2 },
      { name: 'u_square', label: 'Square', labelKey: 'lighting.controls.param.square', min: 0.0, max: 1.0, step: 0.02, defaultValue: 1.0 },
      { name: 'u_glow',   label: 'Glow', labelKey: 'lighting.controls.param.glow',   min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'meshgradient',  labelKey: 'lighting.controls.meshgradient', params: [
      { name: 'u_blobs',    label: 'Blobs', labelKey: 'lighting.controls.param.blobs',    min: 3,   max: 6,   step: 1,    defaultValue: 5 },
      { name: 'u_spread',   label: 'Spread', labelKey: 'lighting.controls.param.spread',   min: 0.3, max: 1.2, step: 0.02, defaultValue: 0.8 },
      { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness', min: 0.3, max: 1.5, step: 0.02, defaultValue: 0.8 },
  ]},
  { key: 'tide',          labelKey: 'lighting.controls.tide',         params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers',    min: 2,    max: 7,    step: 1,     defaultValue: 5 },
      { name: 'u_amp',    label: 'Height', labelKey: 'lighting.controls.param.height',    min: 0.02, max: 0.18, step: 0.005, defaultValue: 0.08 },
      { name: 'u_freq',   label: 'Frequency', labelKey: 'lighting.controls.param.frequency', min: 1,    max: 8,    step: 0.5,   defaultValue: 4 },
  ]},
  { key: 'vapor',         labelKey: 'lighting.controls.vapor',        params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density', min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_scale',   label: 'Scale', labelKey: 'lighting.controls.param.scale',   min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_drift',   label: 'Drift', labelKey: 'lighting.controls.param.drift',   min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'satinflow',     labelKey: 'lighting.controls.satinflow',    params: [
      { name: 'u_folds', label: 'Folds', labelKey: 'lighting.controls.param.folds', min: 2,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_flow',  label: 'Flow', labelKey: 'lighting.controls.param.flow',  min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_sheen', label: 'Sheen', labelKey: 'lighting.controls.param.sheen', min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'ridgeline',     labelKey: 'lighting.controls.ridgeline',    params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers', min: 2,    max: 7,    step: 1,     defaultValue: 5 },
      { name: 'u_jag',    label: 'Jag', labelKey: 'lighting.controls.param.jag',    min: 1,    max: 8,    step: 0.1,   defaultValue: 4 },
      { name: 'u_height', label: 'Height', labelKey: 'lighting.controls.param.height', min: 0.05, max: 0.4,  step: 0.01,  defaultValue: 0.18 },
  ]},
  { key: 'chevron',       labelKey: 'lighting.controls.chevron',      params: [
      { name: 'u_bands', label: 'Bands', labelKey: 'lighting.controls.param.bands', min: 4,    max: 40,  step: 1,    defaultValue: 14 },
      { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle', min: 0.0,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_width', label: 'Width', labelKey: 'lighting.controls.param.width', min: 0.05, max: 0.5, step: 0.01, defaultValue: 0.18 },
  ]},
  { key: 'terrace',       labelKey: 'lighting.controls.terrace',      params: [
      { name: 'u_levels', label: 'Levels', labelKey: 'lighting.controls.param.levels', min: 3,   max: 16,  step: 1,    defaultValue: 8 },
      { name: 'u_scale',  label: 'Scale', labelKey: 'lighting.controls.param.scale',  min: 0.5, max: 3.0, step: 0.05, defaultValue: 1.4 },
      { name: 'u_line',   label: 'Lines', labelKey: 'lighting.controls.param.lines',  min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
  ]},
  { key: 'harlequin',     labelKey: 'lighting.controls.harlequin',    params: [
      { name: 'u_cells', label: 'Cells', labelKey: 'lighting.controls.param.cells', min: 3,   max: 20,  step: 1,    defaultValue: 8 },
      { name: 'u_skew',  label: 'Skew', labelKey: 'lighting.controls.param.skew',  min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_shift', label: 'Shift', labelKey: 'lighting.controls.param.shift', min: 0.0, max: 2.0, step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'mosaic',        labelKey: 'lighting.controls.mosaic',       params: [
      { name: 'u_cells', label: 'Cells', labelKey: 'lighting.controls.param.cells', min: 3,   max: 18,  step: 1,    defaultValue: 9 },
      { name: 'u_wave',  label: 'Wave', labelKey: 'lighting.controls.param.wave',  min: 0.5, max: 4.0, step: 0.05, defaultValue: 1.5 },
      { name: 'u_pop',   label: 'Pop', labelKey: 'lighting.controls.param.pop',   min: 0.0, max: 1.5, step: 0.05, defaultValue: 0.7 },
  ]},
  { key: 'beatbuilder', labelKey: 'lighting.controls.beatbuilder', audio: true, hideSpeed: true, params: [
      { name: 'u_colorMode', labelKey: 'lighting.controls.bb.colorMode', label: 'Color Mode',
        min: 0, max: 1, step: 1, defaultValue: 1,
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.solid' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.rainbow' },
        ] },
      { name: 'u_centerStyle', labelKey: 'lighting.controls.bb.centerStyle', label: 'Center Style',
        min: 0, max: 3, step: 1, defaultValue: 2,
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.bars' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.smooth' },
          { value: 2, labelKey: 'lighting.controls.bb.opt.dots' },
          { value: 3, labelKey: 'lighting.controls.bb.opt.radial' },
        ] },
      { name: 'u_barCount',    labelKey: 'lighting.controls.bb.barCount',    label: 'Bars',              min: 8,    max: 96,  step: 1,     defaultValue: 48 },
      { name: 'u_barWidth',    labelKey: 'lighting.controls.bb.barWidth',    label: 'Bar Width',         min: 0.1,  max: 1,   step: 0.02,  defaultValue: 0.7 },
      { name: 'u_centerGain',  labelKey: 'lighting.controls.bb.centerGain',  label: 'Gain',              min: 0.3,  max: 3,   step: 0.05,  defaultValue: 1.2 },
      { name: 'u_centerFloor', labelKey: 'lighting.controls.bb.centerFloor', label: 'Noise Gate',        min: 0,    max: 0.3, step: 0.01,  defaultValue: 0.04 },
      { name: 'u_centerSize',  labelKey: 'lighting.controls.bb.centerSize',  label: 'Size',              min: 0.3,  max: 1.1, step: 0.02,  defaultValue: 0.8 },
      { name: 'u_topMeters', labelKey: 'lighting.controls.bb.topMeters', label: 'Top Meters',
        min: 0, max: 1, step: 1, defaultValue: 1,
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_cornerFills', labelKey: 'lighting.controls.bb.cornerFills', label: 'Corner Fills',
        min: 0, max: 1, step: 1, defaultValue: 1,
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_topHeight',  labelKey: 'lighting.controls.bb.topHeight',  label: 'Top Height',        min: 0.04, max: 0.25, step: 0.005, defaultValue: 0.085 },
      { name: 'u_bottomBars', labelKey: 'lighting.controls.bb.bottomBars', label: 'Bottom Bars',
        min: 0, max: 1, step: 1, defaultValue: 1,
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_bottomScale', labelKey: 'lighting.controls.bb.bottomScale', label: 'Bottom Height',     min: 0.02, max: 0.2, step: 0.005, defaultValue: 0.07 },
      { name: 'u_bgLevel',    labelKey: 'lighting.controls.bb.bgLevel',    label: 'Background',        min: 0,    max: 0.2, step: 0.01,  defaultValue: 0 },
      { name: 'u_beatColor',  labelKey: 'lighting.controls.bb.beatColor',  label: 'Beat Color',        min: 0,    max: 1,   step: 0.02,  defaultValue: 0 },
      { name: 'u_flash',      labelKey: 'lighting.controls.bb.flash',      label: 'Beat Flash',        min: 0,    max: 1.5, step: 0.05,  defaultValue: 0 },
      { name: 'u_beatPulse',  labelKey: 'lighting.controls.bb.beatPulse',  label: 'Beat Pulse',        min: 0,    max: 1,   step: 0.02,  defaultValue: 0.3 },
      { name: 'u_audioBoost', labelKey: 'lighting.controls.bb.audioBoost', label: 'Audio Intensity',   min: 0,    max: 2,   step: 0.05,  defaultValue: 1 },
  ]},
  { key: 'spectrumbars',   labelKey: 'lighting.controls.spectrumbars',   audio: true, params: [
      { name: 'u_bars',       label: 'Bars', labelKey: 'lighting.controls.param.bars',            min: 8,   max: 16,  step: 1,    defaultValue: 16 },
      { name: 'u_gap',        label: 'Gap', labelKey: 'lighting.controls.param.gap',             min: 0.0, max: 0.3, step: 0.01, defaultValue: 0.12 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'spectrumradial', labelKey: 'lighting.controls.spectrumradial', audio: true, params: [
      { name: 'u_spokes',     label: 'Spokes', labelKey: 'lighting.controls.param.spokes',          min: 16,  max: 64,  step: 1,    defaultValue: 32 },
      { name: 'u_radius',     label: 'Core', labelKey: 'lighting.controls.param.core',            min: 0.0, max: 0.4, step: 0.01, defaultValue: 0.1 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'scope',          labelKey: 'lighting.controls.scope',          audio: true, params: [
      { name: 'u_thickness',  label: 'Thickness', labelKey: 'lighting.controls.param.thickness',       min: 0.002, max: 0.04, step: 0.001, defaultValue: 0.012 },
      { name: 'u_harmonics',  label: 'Layers', labelKey: 'lighting.controls.param.layers',          min: 1,     max: 5,    step: 1,     defaultValue: 3 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',            min: 0.3,   max: 2.0,  step: 0.05,  defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,     max: 2,    step: 0.05,  defaultValue: 1.0 },
  ]},
  { key: 'basspulse',      labelKey: 'lighting.controls.basspulse',      audio: true, params: [
      { name: 'u_rings',      label: 'Rings', labelKey: 'lighting.controls.param.rings',           min: 1,   max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_ringSpeed',  label: 'Speed', labelKey: 'lighting.controls.param.speed',           min: 0.3, max: 3.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_halo',       label: 'Halo', labelKey: 'lighting.controls.param.halo',            min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'beatstrobe',     labelKey: 'lighting.controls.beatstrobe',     audio: true, params: [
      { name: 'u_stripes',    label: 'Stripes', labelKey: 'lighting.controls.param.stripes',         min: 3,   max: 16,  step: 1,    defaultValue: 7 },
      { name: 'u_flash',      label: 'Flash', labelKey: 'lighting.controls.param.flash',           min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.2 },
      { name: 'u_chroma',     label: 'Chroma', labelKey: 'lighting.controls.param.chroma',          min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'harmonicstar',   labelKey: 'lighting.controls.harmonicstar',   audio: true, params: [
      { name: 'u_points',     label: 'Points', labelKey: 'lighting.controls.param.points',          min: 6,   max: 16,  step: 1,    defaultValue: 12 },
      { name: 'u_core',       label: 'Core', labelKey: 'lighting.controls.param.core',            min: 0.05, max: 0.3, step: 0.01, defaultValue: 0.1 },
      { name: 'u_flare',      label: 'Flare', labelKey: 'lighting.controls.param.flare',           min: 0.2, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'audiotunnel',    labelKey: 'lighting.controls.audiotunnel',    audio: true, params: [
      { name: 'u_ringDensity', label: 'Rings', labelKey: 'lighting.controls.param.rings',          min: 3,   max: 12,  step: 1,    defaultValue: 6 },
      { name: 'u_twist',       label: 'Twist', labelKey: 'lighting.controls.param.twist',          min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.8 },
      { name: 'u_neon',        label: 'Neon', labelKey: 'lighting.controls.param.neon',           min: 0.3, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost',  label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity', min: 0,   max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'bassbloom',      labelKey: 'lighting.controls.bassbloom',      audio: true, params: [
      { name: 'u_petals',     label: 'Petals', labelKey: 'lighting.controls.param.petals',          min: 4,    max: 12,  step: 1,    defaultValue: 7 },
      { name: 'u_shimmer',    label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer',         min: 0.0,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_bloomSize',  label: 'Size', labelKey: 'lighting.controls.param.size',            min: 0.1,  max: 0.8, step: 0.02, defaultValue: 0.4 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,    max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  // Authored for a whole panel rather than an LED strip - see
  // MEDIA_VISUALIZER_EFFECTS, which is the media immersive visualizer's set.
  { key: 'spectrumaurora', labelKey: 'lighting.controls.spectrumaurora', audio: true, params: [
      { name: 'u_curtains',   label: 'Curtains', labelKey: 'lighting.controls.param.curtains',       min: 2,    max: 8,   step: 1,    defaultValue: 5 },
      { name: 'u_height',     label: 'Height', labelKey: 'lighting.controls.param.height',         min: 0.2,  max: 1.4, step: 0.05, defaultValue: 0.75 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',           min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,    max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'neonwaveform',   labelKey: 'lighting.controls.neonwaveform',   audio: true, params: [
      { name: 'u_amplitude',  label: 'Amplitude', labelKey: 'lighting.controls.param.amplitude',      min: 0.1,  max: 0.9,  step: 0.05,  defaultValue: 0.35 },
      { name: 'u_thickness',  label: 'Thickness', labelKey: 'lighting.controls.param.thickness',      min: 0.01, max: 0.2,  step: 0.005, defaultValue: 0.03 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',           min: 0.3,  max: 2.0,  step: 0.05,  defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,    max: 2,    step: 0.05,  defaultValue: 1.0 },
  ]},
  { key: 'liquidbeat',     labelKey: 'lighting.controls.liquidbeat',     audio: true, params: [
      { name: 'u_blobs',      label: 'Blobs', labelKey: 'lighting.controls.param.blobs',          min: 2,    max: 9,   step: 1,    defaultValue: 5 },
      { name: 'u_viscosity',  label: 'Viscosity', labelKey: 'lighting.controls.param.viscosity',      min: 0.2,  max: 2.5, step: 0.05, defaultValue: 1.0 },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow',           min: 0.3,  max: 2.0, step: 0.05, defaultValue: 1.0 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,    max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
  { key: 'beatburst',      labelKey: 'lighting.controls.beatburst',      audio: true, params: [
      { name: 'u_streaks',    label: 'Streaks', labelKey: 'lighting.controls.param.streaks',        min: 8,    max: 64,  step: 1,    defaultValue: 40 },
      { name: 'u_trail',      label: 'Trail', labelKey: 'lighting.controls.param.trail',          min: 0.2,  max: 1.8, step: 0.05, defaultValue: 1.15 },
      { name: 'u_spread',     label: 'Spread', labelKey: 'lighting.controls.param.spread',         min: 0.05, max: 1.2, step: 0.05, defaultValue: 0.45 },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity',  min: 0,    max: 2,   step: 0.05, defaultValue: 1.0 },
  ]},
];

/**
 * Patterns Static mode offers alongside the fills. Each one's shader reads
 * u_time only through a u_speed product, so speed 0 holds a still frame -
 * StaticEffectCatalogTests pins that against the GLSL, and the list mirrors
 * StaticEffectCatalog.Patterns in nexus-service.
 */
export const STATIC_PATTERN_KEYS: readonly string[] = [
  'gradientlinear', 'gradientradial', 'gradienttri', 'gradientconic',
  'mirror', 'corners',
  'splitsharp', 'stripes', 'checker', 'border', 'rings', 'dots', 'wedges',
  'spectrumramp', 'spectrumbands', 'huewheel',
];
const STATIC_FILL_SET: ReadonlySet<string> = new Set(SIMPLE_EFFECT_KEYS);
const STATIC_KEY_SET: ReadonlySet<string> = new Set<string>([...SIMPLE_EFFECT_KEYS, ...STATIC_PATTERN_KEYS]);

/** True for the solid fills, which Static mode owns outright. */
export function isStaticFill(key: string): boolean {
  return STATIC_FILL_SET.has(key);
}

export function isStaticEffect(key: string): boolean {
  return STATIC_KEY_SET.has(key);
}

/** Static-mode pool: fills first (category order), then the frozen patterns. */
export const STATIC_EFFECTS: EffectDef[] = EFFECTS.filter(e => STATIC_KEY_SET.has(e.key));

/**
 * Static-mode browse pool for the lighting page. Flat colours come from the
 * palette instead, so only the patterns are browsed as effects.
 */
export const STATIC_PATTERN_EFFECTS: EffectDef[] = STATIC_EFFECTS.filter(e => !isStaticFill(e.key));

/** Mirrors StaticEffectCatalog.DefaultEffect in nexus-service. */
export const DEFAULT_STATIC_EFFECT = 'gradientlinear';

/**
 * Animate-mode pool: everything Static does not own. The static set is
 * purpose-built for a held frame - the patterns have no clock to run - so they
 * must not appear here or Animation can select one and sit motionless.
 */
export const ANIMATE_EFFECTS: EffectDef[] = EFFECTS.filter(e => !STATIC_KEY_SET.has(e.key));

/**
 * Simple-mode browse pool: the flat colours, rendered as
 * an uncategorised hero grid. Everything else stays advanced-only.
 */
export const SIMPLE_MODE_EFFECTS: EffectDef[] = STATIC_EFFECTS.filter(e => isStaticFill(e.key));

export function defaultParamsFor(key: string): Record<string, number> {
  const def = EFFECTS.find(e => e.key === key);
  if (!def) return {};
  const p: Record<string, number> = {};
  for (const pd of def.params) { p[pd.name] = pd.defaultValue; }
  // Colour slots are params too: they must be in the canonical set or the
  // saved template slot carries no colour, the engine renders unset uniforms,
  // and Reset has nothing to restore.
  for (const c of def.colors ?? []) {
    p[`u_${c.id}Hue`] = c.defaultHue;
    p[`u_${c.id}Sat`] = c.defaultSat;
    p[`u_${c.id}Val`] = c.defaultVal;
  }
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
