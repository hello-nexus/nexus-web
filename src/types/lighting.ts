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

/**
 * Names and labels the sliders/selects the UI renders for an effect; the
 * numeric range comes from the fetched shader's hint_range annotations
 * (useShaderParams), keyed by `name`, never from a client-side table.
 */
export interface EffectParamDef {
  name: string;   // GLSL uniform name (e.g. u_zoom)
  label: string;  // display label (or i18n key when labelKey is set)
  labelKey?: string; // i18n key; when present the UI calls t(labelKey) instead of using label directly
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

/**
 * A per-effect colour the user picks with the wheel. Each maps to an HSV
 * triple carried in `params` as u_<id>Hue / u_<id>Sat / u_<id>Val; the
 * default HSV comes from those uniforms' hint_range annotations.
 */
export interface EffectColorSlot {
  id: 'a' | 'b' | 'c' | 'd';
  labelKey: string;
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
  // Cosmic: space, sky, electric (15).
  aurora: 'cosmic', starfield: 'cosmic', nebula: 'cosmic', cosmicdust: 'cosmic',
  caustics: 'cosmic', galaxy: 'cosmic', starpath: 'cosmic', meteor: 'cosmic',
  bokeh: 'cosmic', bursts: 'cosmic', lightning: 'cosmic', plasmaglobe: 'cosmic',
  neonrain: 'cosmic', constellation: 'cosmic', hyperspace: 'cosmic',
  // Organic: fluid, fire, smoke, natural texture (17).
  plasma: 'organic', fire: 'organic', watercolor: 'organic', jellyfish: 'organic',
  lavalamp: 'organic', inkbloom: 'organic', oilslick: 'organic',
  ferrofluid: 'organic', liquidchrome: 'organic', flowfield: 'organic',
  bubbles: 'organic', silkwave: 'organic', vapor: 'organic', satinflow: 'organic',
  lavafissure: 'organic', sandstorm: 'organic', contourbands: 'organic',
  // Geometric: tunnels, lattices, fractals, structured (19).
  spiral: 'geometric', voronoi: 'geometric', kaleidoscope: 'geometric',
  wormhole: 'geometric', sacredgeometry: 'geometric', tessellation: 'geometric',
  chromaspiral: 'geometric', neongrid: 'geometric', hextunnel: 'geometric',
  mandelbrot: 'geometric', circuit: 'geometric', crystaltunnel: 'geometric',
  ringtunnel: 'geometric', vortextunnel: 'geometric', helixtunnel: 'geometric',
  boxtunnel: 'geometric', harlequin: 'geometric', mosaic: 'geometric',
  cybertunnel: 'geometric',
  // Pattern: waves, gradients, abstract graphic shapes (21).
  rainbow: 'pattern', matrix: 'pattern', ripple: 'pattern', wave: 'pattern',
  gradientwave: 'pattern', ball: 'pattern', radar: 'pattern', pulse: 'pattern',
  interference: 'pattern', domainwarp: 'pattern', dotmatrix: 'pattern',
  prismwave: 'pattern', ribbonflow: 'pattern', meshgradient: 'pattern',
  tide: 'pattern', ridgeline: 'pattern', chevron: 'pattern', terrace: 'pattern',
  sharplines: 'pattern', synthwave: 'pattern', retropetals: 'pattern',
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
  { name: 'u_hueShift', label: 'Hue shift', labelKey: 'lighting.controls.param.hueShift', zeroMarker: true },
  { name: 'u_warmth',   label: 'Warmth', labelKey: 'lighting.controls.param.warmth', zeroMarker: true },
];
const SIMPLE_WHITE_PARAMS: EffectParamDef[] = [
  { name: 'u_warmth', label: 'Warmth', labelKey: 'lighting.controls.param.warmth', zeroMarker: true },
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
// and their own colours rather than the global tint.
  { key: 'gradientlinear', labelKey: 'lighting.controls.gradientlinear', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_midpoint', label: 'Midpoint', labelKey: 'lighting.controls.param.midpoint' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'gradientradial', labelKey: 'lighting.controls.gradientradial', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_radius', label: 'Size', labelKey: 'lighting.controls.param.size' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'gradienttri', labelKey: 'lighting.controls.gradienttri', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }, { id: 'c', labelKey: 'lighting.controls.color3' }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_midpoint', label: 'Midpoint', labelKey: 'lighting.controls.param.midpoint' },
  ]},
  { key: 'gradientconic', labelKey: 'lighting.controls.gradientconic', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_offset', label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
  ]},
  { key: 'mirror', labelKey: 'lighting.controls.mirror', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'corners', labelKey: 'lighting.controls.corners', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }, { id: 'c', labelKey: 'lighting.controls.color3' }, { id: 'd', labelKey: 'lighting.controls.color4' }], params: [] },
  { key: 'splitsharp', labelKey: 'lighting.controls.splitsharp', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_position', label: 'Position', labelKey: 'lighting.controls.param.position' },
  ]},
  { key: 'stripes', labelKey: 'lighting.controls.stripes', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count' },
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
    { name: 'u_balance', label: 'Balance', labelKey: 'lighting.controls.param.balance' },
  ]},
  { key: 'checker', labelKey: 'lighting.controls.checker', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'border', labelKey: 'lighting.controls.border', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'rings', labelKey: 'lighting.controls.rings', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'dots', labelKey: 'lighting.controls.dots', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_spacing', label: 'Gap', labelKey: 'lighting.controls.param.gap' },
    { name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size' },
    { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'wedges', labelKey: 'lighting.controls.wedges', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }, { id: 'b', labelKey: 'lighting.controls.color2' }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count' },
    { name: 'u_offset', label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
  ]},
  { key: 'spectrumramp', labelKey: 'lighting.controls.spectrumramp', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }], params: [
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
    { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
  ]},
  { key: 'spectrumbands', labelKey: 'lighting.controls.spectrumbands', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }], params: [
    { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count' },
    { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
  ]},
  { key: 'huewheel', labelKey: 'lighting.controls.huewheel', hideSpeed: true,
     colors: [{ id: 'a', labelKey: 'lighting.controls.color1' }], params: [] },
  { key: 'plasma',       labelKey: 'lighting.controls.plasma',       params: [
      { name: 'u_warp', label: 'Warp', labelKey: 'lighting.controls.param.warp' },
      { name: 'u_zoom', label: 'Zoom', labelKey: 'lighting.controls.param.zoom' },
  ]},
  { key: 'fire',         labelKey: 'lighting.controls.fire',         params: [{ name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence' }] },
  { key: 'rainbow',     labelKey: 'lighting.controls.rainbow',     params: [
      { name: 'u_density',  label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_rotation', label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
  ]},
  // Brushstrokes' hard-edged sibling: flat hue bars with black between them.
  // Position slides the colour/black split inside each bar, so it thickens the
  // gaps the way splitsharp's Position grows one side of the frame.
  { key: 'sharplines',  labelKey: 'lighting.controls.sharplines',  params: [
      { name: 'u_density',  label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_rotation', label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
      { name: 'u_position', label: 'Position', labelKey: 'lighting.controls.param.position' },
  ]},
  { key: 'spiral',       labelKey: 'lighting.controls.spiral',       params: [
      { name: 'u_arms',      label: 'Arms', labelKey: 'lighting.controls.param.arms' },
      { name: 'u_tightness', label: 'Tightness', labelKey: 'lighting.controls.param.tightness' },
  ]},
  { key: 'matrix',       labelKey: 'lighting.controls.matrix',       params: [
      { name: 'u_columns', label: 'Columns', labelKey: 'lighting.controls.param.columns' },
      { name: 'u_fade',    label: 'Fade', labelKey: 'lighting.controls.param.fade' },
  ]},
  { key: 'meteor',       labelKey: 'lighting.controls.meteor',       params: [
      { name: 'u_streaks', label: 'Streaks', labelKey: 'lighting.controls.param.streaks' },
      { name: 'u_width',   label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'ripple',       labelKey: 'lighting.controls.ripple',       params: [{ name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency' }] },
  { key: 'wave',         labelKey: 'lighting.controls.wave',         params: [
      { name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency' },
      { name: 'u_amp',  label: 'Amplitude', labelKey: 'lighting.controls.param.amplitude' },
  ]},
  { key: 'gradientwave', labelKey: 'lighting.controls.gradientwave', params: [{ name: 'u_freq', label: 'Frequency', labelKey: 'lighting.controls.param.frequency' }] },
  { key: 'ball',         labelKey: 'lighting.controls.ball',         params: [
      { name: 'u_count', label: 'Ball count', labelKey: 'lighting.controls.param.ballCount' },
      { name: 'u_size',  label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'radar',        labelKey: 'lighting.controls.radar',        params: [{ name: 'u_ringRate', label: 'Ring rate', labelKey: 'lighting.controls.param.ringRate' }] },
  { key: 'pulse',        labelKey: 'lighting.controls.pulse',        showIntensity: true, params: [{ name: 'u_size', label: 'Size', labelKey: 'lighting.controls.param.size' }] },
  { key: 'watercolor',  labelKey: 'lighting.controls.watercolor',  params: [
      { name: 'u_blobs',    label: 'Blobs', labelKey: 'lighting.controls.param.blobs' },
      { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'jellyfish',   labelKey: 'lighting.controls.jellyfish',   params: [
      { name: 'u_count', label: 'Count', labelKey: 'lighting.controls.param.count' },
      { name: 'u_glow',  label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'aurora',       labelKey: 'lighting.controls.aurora',       params: [
      { name: 'u_curtains', label: 'Curtains', labelKey: 'lighting.controls.param.curtains' },
      { name: 'u_height',   label: 'Height', labelKey: 'lighting.controls.param.height' },
      { name: 'u_shimmer',  label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer' },
  ]},
  { key: 'lavalamp',     labelKey: 'lighting.controls.lavalamp',     params: [
      { name: 'u_count',     label: 'Blobs', labelKey: 'lighting.controls.param.blobs' },
      { name: 'u_viscosity', label: 'Viscosity', labelKey: 'lighting.controls.param.viscosity' },
      { name: 'u_size',      label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'starfield',    labelKey: 'lighting.controls.starfield',    params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_layers',  label: 'Depth layers', labelKey: 'lighting.controls.param.depthLayers' },
      { name: 'u_trail',   label: 'Trail', labelKey: 'lighting.controls.param.trail' },
  ]},
  { key: 'voronoi',      labelKey: 'lighting.controls.voronoi',      params: [
      { name: 'u_scale',     label: 'Scale', labelKey: 'lighting.controls.param.scale' },
      { name: 'u_edgeWidth', label: 'Edge width', labelKey: 'lighting.controls.param.edgeWidth' },
      { name: 'u_drift',     label: 'Drift', labelKey: 'lighting.controls.param.drift' },
  ]},
  { key: 'neonrain',     labelKey: 'lighting.controls.neonrain',     params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_length',  label: 'Length', labelKey: 'lighting.controls.param.length' },
      { name: 'u_splash',  label: 'Splash', labelKey: 'lighting.controls.param.splash' },
  ]},
  { key: 'nebula',        labelKey: 'lighting.controls.nebula',       params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_stars',   label: 'Stars', labelKey: 'lighting.controls.param.stars' },
      { name: 'u_depth',   label: 'Layers', labelKey: 'lighting.controls.param.layers' },
  ]},
  { key: 'bursts',        labelKey: 'lighting.controls.bursts',       params: [
      { name: 'u_rate',      label: 'Rate', labelKey: 'lighting.controls.param.rate' },
      { name: 'u_particles', label: 'Particles', labelKey: 'lighting.controls.param.particles' },
      { name: 'u_size',      label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'lavafissure',   labelKey: 'lighting.controls.lavafissure',  params: [
      { name: 'u_flow',       label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_crackWidth', label: 'Cracks', labelKey: 'lighting.controls.param.cracks' },
      { name: 'u_shimmer',    label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer' },
  ]},
  { key: 'kaleidoscope',  labelKey: 'lighting.controls.kaleidoscope', params: [
      { name: 'u_sides', label: 'Sides', labelKey: 'lighting.controls.param.sides' },
      { name: 'u_spin',  label: 'Spin', labelKey: 'lighting.controls.param.spin' },
      { name: 'u_inner', label: 'Detail', labelKey: 'lighting.controls.param.detail' },
  ]},
  { key: 'wormhole',      labelKey: 'lighting.controls.wormhole',     params: [
      { name: 'u_depth', label: 'Depth', labelKey: 'lighting.controls.param.depth' },
      { name: 'u_rings', label: 'Rings', labelKey: 'lighting.controls.param.rings' },
      { name: 'u_twist', label: 'Twist', labelKey: 'lighting.controls.param.twist' },
  ]},
  { key: 'interference',  labelKey: 'lighting.controls.interference', params: [
      { name: 'u_wavelength', label: 'Wavelength', labelKey: 'lighting.controls.param.wavelength' },
      { name: 'u_sources',    label: 'Sources', labelKey: 'lighting.controls.param.sources' },
  ]},
  { key: 'sacredgeometry', labelKey: 'lighting.controls.sacredgeometry', params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers' },
      { name: 'u_edge',   label: 'Edge', labelKey: 'lighting.controls.param.edge' },
      { name: 'u_pulse',  label: 'Pulse', labelKey: 'lighting.controls.param.pulse' },
  ]},
  { key: 'tessellation',  labelKey: 'lighting.controls.tessellation', params: [
      { name: 'u_shape', label: 'Shape', labelKey: 'lighting.controls.param.shape' },
      { name: 'u_morph', label: 'Morph', labelKey: 'lighting.controls.param.morph' },
      { name: 'u_edge',  label: 'Edge', labelKey: 'lighting.controls.param.edge' },
  ]},
  { key: 'domainwarp',    labelKey: 'lighting.controls.domainwarp',   params: [
      { name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence' },
      { name: 'u_direction',  label: 'Direction', labelKey: 'lighting.controls.param.direction' },
      { name: 'u_bite',       label: 'Bite', labelKey: 'lighting.controls.param.bite' },
  ]},
  { key: 'inkbloom',      labelKey: 'lighting.controls.inkbloom',     params: [
      { name: 'u_spread', label: 'Spread', labelKey: 'lighting.controls.param.spread' },
      { name: 'u_curl',   label: 'Curl', labelKey: 'lighting.controls.param.curl' },
      { name: 'u_fade',   label: 'Fade', labelKey: 'lighting.controls.param.fade' },
  ]},
  { key: 'cosmicdust',    labelKey: 'lighting.controls.cosmicdust',   params: [
      { name: 'u_particles', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_twinkle',   label: 'Twinkle', labelKey: 'lighting.controls.param.twinkle' },
      { name: 'u_parallax',  label: 'Parallax', labelKey: 'lighting.controls.param.parallax' },
  ]},
  { key: 'chromaspiral',  labelKey: 'lighting.controls.chromaspiral', params: [
      { name: 'u_tightness', label: 'Tightness', labelKey: 'lighting.controls.param.tightness' },
      { name: 'u_spin',      label: 'Spin', labelKey: 'lighting.controls.param.spin' },
      { name: 'u_bands',     label: 'Bands', labelKey: 'lighting.controls.param.bands' },
  ]},
  { key: 'neongrid',      labelKey: 'lighting.controls.neongrid',     params: [
      { name: 'u_density', label: 'Cells', labelKey: 'lighting.controls.param.cells' },
      { name: 'u_pulse',   label: 'Pulse', labelKey: 'lighting.controls.param.pulse' },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_spread',  label: 'Spread', labelKey: 'lighting.controls.param.spread' },
  ]},
  { key: 'oilslick',      labelKey: 'lighting.controls.oilslick',     params: [
      { name: 'u_flow',         label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_iridescence',  label: 'Iridescence', labelKey: 'lighting.controls.param.iridescence' },
      { name: 'u_scale',        label: 'Scale', labelKey: 'lighting.controls.param.scale' },
  ]},
  { key: 'caustics',      labelKey: 'lighting.controls.caustics',     params: [
      { name: 'u_density',    label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness' },
      { name: 'u_flow',       label: 'Flow', labelKey: 'lighting.controls.param.flow' },
  ]},
  { key: 'galaxy',        labelKey: 'lighting.controls.galaxy',       params: [
      { name: 'u_arms',     label: 'Arms', labelKey: 'lighting.controls.param.arms' },
      { name: 'u_dust',     label: 'Dust', labelKey: 'lighting.controls.param.dust' },
      { name: 'u_rotation', label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
      { name: 'u_stars',    label: 'Stars', labelKey: 'lighting.controls.param.stars' },
  ]},
  { key: 'starpath',      labelKey: 'lighting.controls.starpath',     params: [
      { name: 'u_trail',      label: 'Trail', labelKey: 'lighting.controls.param.trail' },
      { name: 'u_axisShift',  label: 'Axis', labelKey: 'lighting.controls.param.axis' },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness' },
  ]},
  { key: 'plasmaglobe',   labelKey: 'lighting.controls.plasmaglobe',  params: [
      { name: 'u_branches', label: 'Branches', labelKey: 'lighting.controls.param.branches' },
      { name: 'u_jitter',   label: 'Crackle', labelKey: 'lighting.controls.param.crackle' },
      { name: 'u_power',    label: 'Power', labelKey: 'lighting.controls.param.power' },
  ]},
  { key: 'lightning',     labelKey: 'lighting.controls.lightning',    params: [
      { name: 'u_boltRate', label: 'Bolt rate', labelKey: 'lighting.controls.param.boltRate' },
      { name: 'u_forks',    label: 'Forks', labelKey: 'lighting.controls.param.forks' },
      { name: 'u_glow',     label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'flowfield',     labelKey: 'lighting.controls.flowfield',    params: [
      { name: 'u_streams',     label: 'Streams', labelKey: 'lighting.controls.param.streams' },
      { name: 'u_flow',        label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_colorSpread', label: 'Spread', labelKey: 'lighting.controls.param.spread' },
  ]},
  { key: 'ferrofluid',    labelKey: 'lighting.controls.ferrofluid',   params: [
      { name: 'u_density',   label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_sharpness', label: 'Sharpness', labelKey: 'lighting.controls.param.sharpness' },
      { name: 'u_motion',    label: 'Motion', labelKey: 'lighting.controls.param.motion' },
  ]},
  { key: 'liquidchrome',  labelKey: 'lighting.controls.liquidchrome', params: [
      { name: 'u_flow',      label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness' },
      { name: 'u_ripple',    label: 'Ripple', labelKey: 'lighting.controls.param.ripple' },
  ]},
  { key: 'hextunnel',     labelKey: 'lighting.controls.hextunnel',    params: [
      { name: 'u_cellSize', label: 'Cell', labelKey: 'lighting.controls.param.cell' },
      { name: 'u_zoomRate', label: 'Zoom', labelKey: 'lighting.controls.param.zoom' },
      { name: 'u_neon',     label: 'Neon', labelKey: 'lighting.controls.param.neon' },
  ]},
  { key: 'mandelbrot',    labelKey: 'lighting.controls.mandelbrot',   params: [
      { name: 'u_depth',      label: 'Depth', labelKey: 'lighting.controls.param.depth' },
      { name: 'u_rotation',   label: 'Rotation', labelKey: 'lighting.controls.param.rotation' },
      { name: 'u_brightness', label: 'Brightness', labelKey: 'lighting.controls.param.brightness' },
  ]},
  { key: 'circuit',       labelKey: 'lighting.controls.circuit',      params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_pulse',   label: 'Pulse', labelKey: 'lighting.controls.param.pulse' },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'bokeh',         labelKey: 'lighting.controls.bokeh',        params: [
      { name: 'u_lights', label: 'Lights', labelKey: 'lighting.controls.param.lights' },
      { name: 'u_size',   label: 'Size', labelKey: 'lighting.controls.param.size' },
      { name: 'u_drift',  label: 'Drift', labelKey: 'lighting.controls.param.drift' },
  ]},
  { key: 'sandstorm',     labelKey: 'lighting.controls.sandstorm',    params: [
      { name: 'u_wind',    label: 'Wind', labelKey: 'lighting.controls.param.wind' },
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_gusts',   label: 'Gusts', labelKey: 'lighting.controls.param.gusts' },
  ]},
  { key: 'dotmatrix',     labelKey: 'lighting.controls.dotmatrix',    params: [
      { name: 'u_density',    label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_scrollRate', label: 'Scroll', labelKey: 'lighting.controls.param.scroll' },
      { name: 'u_complexity', label: 'Complexity', labelKey: 'lighting.controls.param.complexity' },
  ]},
  { key: 'bubbles',       labelKey: 'lighting.controls.bubbles',      params: [
      { name: 'u_count',     label: 'Bubbles', labelKey: 'lighting.controls.param.bubbles' },
      { name: 'u_rise',      label: 'Rise', labelKey: 'lighting.controls.param.rise' },
      { name: 'u_irid',      label: 'Iridescence', labelKey: 'lighting.controls.param.iridescence' },
  ]},
  { key: 'silkwave',      labelKey: 'lighting.controls.silkwave',     params: [
      { name: 'u_folds',     label: 'Folds', labelKey: 'lighting.controls.param.folds' },
      { name: 'u_flow',      label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_sheen',     label: 'Sheen', labelKey: 'lighting.controls.param.sheen' },
  ]},
  { key: 'prismwave',     labelKey: 'lighting.controls.prismwave',    params: [
      { name: 'u_bands',     label: 'Bands', labelKey: 'lighting.controls.param.bands' },
      { name: 'u_sharpness', label: 'Sharpness', labelKey: 'lighting.controls.param.sharpness' },
      { name: 'u_thickness', label: 'Thickness', labelKey: 'lighting.controls.param.thickness' },
      { name: 'u_drift',     label: 'Drift', labelKey: 'lighting.controls.param.drift' },
  ]},
  { key: 'crystaltunnel', labelKey: 'lighting.controls.crystaltunnel',params: [
      { name: 'u_facets',    label: 'Facets', labelKey: 'lighting.controls.param.facets' },
      { name: 'u_depth',     label: 'Depth', labelKey: 'lighting.controls.param.depth' },
      { name: 'u_refract',   label: 'Refract', labelKey: 'lighting.controls.param.refract' },
  ]},
  { key: 'ribbonflow',    labelKey: 'lighting.controls.ribbonflow',   params: [
      { name: 'u_ribbons',    label: 'Ribbons', labelKey: 'lighting.controls.param.ribbons' },
      { name: 'u_turbulence', label: 'Turbulence', labelKey: 'lighting.controls.param.turbulence' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'ringtunnel',    labelKey: 'lighting.controls.ringtunnel',   params: [
      { name: 'u_rings', label: 'Rings', labelKey: 'lighting.controls.param.rings' },
      { name: 'u_zoom',  label: 'Zoom', labelKey: 'lighting.controls.param.zoom' },
      { name: 'u_neon',  label: 'Neon', labelKey: 'lighting.controls.param.neon' },
  ]},
  { key: 'vortextunnel',  labelKey: 'lighting.controls.vortextunnel', params: [
      { name: 'u_twist', label: 'Twist', labelKey: 'lighting.controls.param.twist' },
      { name: 'u_churn', label: 'Churn', labelKey: 'lighting.controls.param.churn' },
      { name: 'u_depth', label: 'Depth', labelKey: 'lighting.controls.param.depth' },
  ]},
  { key: 'helixtunnel',   labelKey: 'lighting.controls.helixtunnel',  params: [
      { name: 'u_pitch',   label: 'Pitch', labelKey: 'lighting.controls.param.pitch' },
      { name: 'u_strands', label: 'Strands', labelKey: 'lighting.controls.param.strands' },
      { name: 'u_glow',    label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'boxtunnel',     labelKey: 'lighting.controls.boxtunnel',    params: [
      { name: 'u_depth',  label: 'Depth', labelKey: 'lighting.controls.param.depth' },
      { name: 'u_square', label: 'Square', labelKey: 'lighting.controls.param.square' },
      { name: 'u_glow',   label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'meshgradient',  labelKey: 'lighting.controls.meshgradient', params: [
      { name: 'u_blobs',    label: 'Blobs', labelKey: 'lighting.controls.param.blobs' },
      { name: 'u_spread',   label: 'Spread', labelKey: 'lighting.controls.param.spread' },
      { name: 'u_softness', label: 'Softness', labelKey: 'lighting.controls.param.softness' },
  ]},
  { key: 'tide',          labelKey: 'lighting.controls.tide',         params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers' },
      { name: 'u_amp',    label: 'Height', labelKey: 'lighting.controls.param.height' },
      { name: 'u_freq',   label: 'Frequency', labelKey: 'lighting.controls.param.frequency' },
  ]},
  { key: 'vapor',         labelKey: 'lighting.controls.vapor',        params: [
      { name: 'u_density', label: 'Density', labelKey: 'lighting.controls.param.density' },
      { name: 'u_scale',   label: 'Scale', labelKey: 'lighting.controls.param.scale' },
      { name: 'u_drift',   label: 'Drift', labelKey: 'lighting.controls.param.drift' },
  ]},
  { key: 'satinflow',     labelKey: 'lighting.controls.satinflow',    params: [
      { name: 'u_folds', label: 'Folds', labelKey: 'lighting.controls.param.folds' },
      { name: 'u_flow',  label: 'Flow', labelKey: 'lighting.controls.param.flow' },
      { name: 'u_sheen', label: 'Sheen', labelKey: 'lighting.controls.param.sheen' },
  ]},
  { key: 'ridgeline',     labelKey: 'lighting.controls.ridgeline',    params: [
      { name: 'u_layers', label: 'Layers', labelKey: 'lighting.controls.param.layers' },
      { name: 'u_jag',    label: 'Jag', labelKey: 'lighting.controls.param.jag' },
      { name: 'u_height', label: 'Height', labelKey: 'lighting.controls.param.height' },
  ]},
  { key: 'chevron',       labelKey: 'lighting.controls.chevron',      params: [
      { name: 'u_bands', label: 'Bands', labelKey: 'lighting.controls.param.bands' },
      { name: 'u_angle', label: 'Angle', labelKey: 'lighting.controls.param.angle' },
      { name: 'u_width', label: 'Width', labelKey: 'lighting.controls.param.width' },
  ]},
  { key: 'terrace',       labelKey: 'lighting.controls.terrace',      params: [
      { name: 'u_levels', label: 'Levels', labelKey: 'lighting.controls.param.levels' },
      { name: 'u_scale',  label: 'Scale', labelKey: 'lighting.controls.param.scale' },
      { name: 'u_line',   label: 'Lines', labelKey: 'lighting.controls.param.lines' },
  ]},
  { key: 'harlequin',     labelKey: 'lighting.controls.harlequin',    params: [
      { name: 'u_cells', label: 'Cells', labelKey: 'lighting.controls.param.cells' },
      { name: 'u_skew',  label: 'Skew', labelKey: 'lighting.controls.param.skew' },
      { name: 'u_shift', label: 'Shift', labelKey: 'lighting.controls.param.shift' },
  ]},
  { key: 'mosaic',        labelKey: 'lighting.controls.mosaic',       params: [
      { name: 'u_cells', label: 'Cells', labelKey: 'lighting.controls.param.cells' },
      { name: 'u_wave',  label: 'Wave', labelKey: 'lighting.controls.param.wave' },
      { name: 'u_pop',   label: 'Pop', labelKey: 'lighting.controls.param.pop' },
  ]},
  // Constellation mesh plus the Nexus 2 theme set.
  { key: 'constellation', labelKey: 'lighting.controls.constellation', params: [
      { name: 'u_points', label: 'Points', labelKey: 'lighting.controls.param.points' },
      { name: 'u_reach',  label: 'Spread', labelKey: 'lighting.controls.param.spread' },
      { name: 'u_dots',   label: 'Size', labelKey: 'lighting.controls.param.size' },
  ]},
  { key: 'cybertunnel',   labelKey: 'lighting.controls.cybertunnel',   params: [
      { name: 'u_rings',  label: 'Rings', labelKey: 'lighting.controls.param.rings' },
      { name: 'u_spokes', label: 'Spokes', labelKey: 'lighting.controls.param.spokes' },
      { name: 'u_glow',   label: 'Glow', labelKey: 'lighting.controls.param.glow' },
  ]},
  { key: 'hyperspace',    labelKey: 'lighting.controls.hyperspace',    params: [
      { name: 'u_streaks', label: 'Streaks', labelKey: 'lighting.controls.param.streaks' },
      { name: 'u_depth',   label: 'Depth', labelKey: 'lighting.controls.param.depth' },
      { name: 'u_core',    label: 'Core', labelKey: 'lighting.controls.param.core' },
  ]},
  { key: 'synthwave',     labelKey: 'lighting.controls.synthwave',     params: [
      { name: 'u_lines',     label: 'Lines', labelKey: 'lighting.controls.param.lines' },
      { name: 'u_amplitude', label: 'Amplitude', labelKey: 'lighting.controls.param.amplitude' },
      { name: 'u_flow',      label: 'Flow', labelKey: 'lighting.controls.param.flow' },
  ]},
  { key: 'retropetals',   labelKey: 'lighting.controls.retropetals',   params: [
      { name: 'u_petals', label: 'Petals', labelKey: 'lighting.controls.param.petals' },
      { name: 'u_wave',   label: 'Wave', labelKey: 'lighting.controls.param.wave' },
      { name: 'u_spin',   label: 'Spin', labelKey: 'lighting.controls.param.spin', zeroMarker: true },
  ]},
  { key: 'contourbands',  labelKey: 'lighting.controls.contourbands',  params: [
      { name: 'u_bands', label: 'Bands', labelKey: 'lighting.controls.param.bands' },
      { name: 'u_scale', label: 'Scale', labelKey: 'lighting.controls.param.scale' },
      { name: 'u_flow',  label: 'Flow', labelKey: 'lighting.controls.param.flow' },
  ]},
  { key: 'beatbuilder', labelKey: 'lighting.controls.beatbuilder', audio: true, hideSpeed: true, params: [
      { name: 'u_colorMode', labelKey: 'lighting.controls.bb.colorMode', label: 'Color Mode',
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.solid' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.rainbow' },
        ] },
      { name: 'u_centerStyle', labelKey: 'lighting.controls.bb.centerStyle', label: 'Center Style',
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.bars' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.smooth' },
          { value: 2, labelKey: 'lighting.controls.bb.opt.dots' },
          { value: 3, labelKey: 'lighting.controls.bb.opt.radial' },
        ] },
      { name: 'u_barCount',    labelKey: 'lighting.controls.bb.barCount',    label: 'Bars' },
      { name: 'u_barWidth',    labelKey: 'lighting.controls.bb.barWidth',    label: 'Bar Width' },
      { name: 'u_centerGain',  labelKey: 'lighting.controls.bb.centerGain',  label: 'Gain' },
      { name: 'u_centerFloor', labelKey: 'lighting.controls.bb.centerFloor', label: 'Noise Gate' },
      { name: 'u_centerSize',  labelKey: 'lighting.controls.bb.centerSize',  label: 'Size' },
      { name: 'u_topMeters', labelKey: 'lighting.controls.bb.topMeters', label: 'Top Meters',
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_cornerFills', labelKey: 'lighting.controls.bb.cornerFills', label: 'Corner Fills',
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_topHeight',  labelKey: 'lighting.controls.bb.topHeight',  label: 'Top Height' },
      { name: 'u_bottomBars', labelKey: 'lighting.controls.bb.bottomBars', label: 'Bottom Bars',
        options: [
          { value: 0, labelKey: 'lighting.controls.bb.opt.off' },
          { value: 1, labelKey: 'lighting.controls.bb.opt.on' },
        ] },
      { name: 'u_bottomScale', labelKey: 'lighting.controls.bb.bottomScale', label: 'Bottom Height' },
      { name: 'u_bgLevel',    labelKey: 'lighting.controls.bb.bgLevel',    label: 'Background' },
      { name: 'u_beatColor',  labelKey: 'lighting.controls.bb.beatColor',  label: 'Beat Color' },
      { name: 'u_flash',      labelKey: 'lighting.controls.bb.flash',      label: 'Beat Flash' },
      { name: 'u_beatPulse',  labelKey: 'lighting.controls.bb.beatPulse',  label: 'Beat Pulse' },
      { name: 'u_audioBoost', labelKey: 'lighting.controls.bb.audioBoost', label: 'Audio Intensity' },
  ]},
  { key: 'spectrumbars',   labelKey: 'lighting.controls.spectrumbars',   audio: true, params: [
      { name: 'u_bars',       label: 'Bars', labelKey: 'lighting.controls.param.bars' },
      { name: 'u_gap',        label: 'Gap', labelKey: 'lighting.controls.param.gap' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'spectrumradial', labelKey: 'lighting.controls.spectrumradial', audio: true, params: [
      { name: 'u_spokes',     label: 'Spokes', labelKey: 'lighting.controls.param.spokes' },
      { name: 'u_radius',     label: 'Core', labelKey: 'lighting.controls.param.core' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'scope',          labelKey: 'lighting.controls.scope',          audio: true, params: [
      { name: 'u_thickness',  label: 'Thickness', labelKey: 'lighting.controls.param.thickness' },
      { name: 'u_harmonics',  label: 'Layers', labelKey: 'lighting.controls.param.layers' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'basspulse',      labelKey: 'lighting.controls.basspulse',      audio: true, params: [
      { name: 'u_rings',      label: 'Rings', labelKey: 'lighting.controls.param.rings' },
      { name: 'u_ringSpeed',  label: 'Speed', labelKey: 'lighting.controls.param.speed' },
      { name: 'u_halo',       label: 'Halo', labelKey: 'lighting.controls.param.halo' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'beatstrobe',     labelKey: 'lighting.controls.beatstrobe',     audio: true, params: [
      { name: 'u_stripes',    label: 'Stripes', labelKey: 'lighting.controls.param.stripes' },
      { name: 'u_flash',      label: 'Flash', labelKey: 'lighting.controls.param.flash' },
      { name: 'u_chroma',     label: 'Chroma', labelKey: 'lighting.controls.param.chroma' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'harmonicstar',   labelKey: 'lighting.controls.harmonicstar',   audio: true, params: [
      { name: 'u_points',     label: 'Points', labelKey: 'lighting.controls.param.points' },
      { name: 'u_core',       label: 'Core', labelKey: 'lighting.controls.param.core' },
      { name: 'u_flare',      label: 'Flare', labelKey: 'lighting.controls.param.flare' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'audiotunnel',    labelKey: 'lighting.controls.audiotunnel',    audio: true, params: [
      { name: 'u_ringDensity', label: 'Rings', labelKey: 'lighting.controls.param.rings' },
      { name: 'u_twist',       label: 'Twist', labelKey: 'lighting.controls.param.twist' },
      { name: 'u_neon',        label: 'Neon', labelKey: 'lighting.controls.param.neon' },
      { name: 'u_audioBoost',  label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'bassbloom',      labelKey: 'lighting.controls.bassbloom',      audio: true, params: [
      { name: 'u_petals',     label: 'Petals', labelKey: 'lighting.controls.param.petals' },
      { name: 'u_shimmer',    label: 'Shimmer', labelKey: 'lighting.controls.param.shimmer' },
      { name: 'u_bloomSize',  label: 'Size', labelKey: 'lighting.controls.param.size' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  // Authored for a whole panel rather than an LED strip - see
  // MEDIA_VISUALIZER_EFFECTS, which is the media immersive visualizer's set.
  { key: 'spectrumaurora', labelKey: 'lighting.controls.spectrumaurora', audio: true, params: [
      { name: 'u_curtains',   label: 'Curtains', labelKey: 'lighting.controls.param.curtains' },
      { name: 'u_height',     label: 'Height', labelKey: 'lighting.controls.param.height' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'neonwaveform',   labelKey: 'lighting.controls.neonwaveform',   audio: true, params: [
      { name: 'u_amplitude',  label: 'Amplitude', labelKey: 'lighting.controls.param.amplitude' },
      { name: 'u_thickness',  label: 'Thickness', labelKey: 'lighting.controls.param.thickness' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'liquidbeat',     labelKey: 'lighting.controls.liquidbeat',     audio: true, params: [
      { name: 'u_blobs',      label: 'Blobs', labelKey: 'lighting.controls.param.blobs' },
      { name: 'u_viscosity',  label: 'Viscosity', labelKey: 'lighting.controls.param.viscosity' },
      { name: 'u_glow',       label: 'Glow', labelKey: 'lighting.controls.param.glow' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
  ]},
  { key: 'beatburst',      labelKey: 'lighting.controls.beatburst',      audio: true, params: [
      { name: 'u_streaks',    label: 'Streaks', labelKey: 'lighting.controls.param.streaks' },
      { name: 'u_trail',      label: 'Trail', labelKey: 'lighting.controls.param.trail' },
      { name: 'u_spread',     label: 'Spread', labelKey: 'lighting.controls.param.spread' },
      { name: 'u_audioBoost', label: 'Audio Intensity', labelKey: 'lighting.controls.param.audioIntensity' },
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

/**
 * Base state for an effect with no params filled in - the service fills
 * every declared, annotated uniform's default from the GLSL itself
 * (useShaderRenderer does the same client-side), so there is no client
 * table of per-effect param defaults to consult here.
 */
export function defaultStateFor(key: string): EffectState {
  void key;
  return { ...BASE_DEFAULTS, params: {} };
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
