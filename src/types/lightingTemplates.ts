import {
  BASE_DEFAULTS,
  TEMPLATE_COUNT,
  EFFECTS,
  defaultParamsFor,
  type EffectState,
  type EffectTemplateBundle,
} from './lighting';

/**
 * Template defaults for every animate effect.
 *
 * Slot 0 = per-effect "signature" (the iconic look - fire orange, matrix
 * green, nebula purple, etc.) sourced from SIGNATURES. This is also what
 * the server renders as the thumbnail.
 *
 * Slots 1/2/3 carry variety. When the signature IS rainbow (hue=0,
 * colorize=0), those slots are warm / cool / green monos. When the
 * signature is colored, slot 1 is the full rainbow so every effect is
 * reachable as "show me the full spectrum", and slots 2/3 are warm /
 * cool monos.
 *
 * Mono slots stop at colorize=0.75 so there's still a touch of palette
 * variation visible - the PaletteRing enforces the same floor.
 */

type Feel = Pick<EffectState, 'hue' | 'colorize' | 'speed' | 'saturation' | 'contrast' | 'intensity'>;

const RAINBOW:   Feel = { hue: 0.00, colorize: 0.00, speed: 50, saturation: 1.00, contrast: 1.00, intensity: 1 };
const WARM_MONO: Feel = { hue: 0.08, colorize: 0.75, speed: 85, saturation: 1.10, contrast: 1.05, intensity: 1 };
const COOL_MONO: Feel = { hue: 0.62, colorize: 0.75, speed: 30, saturation: 1.00, contrast: 1.00, intensity: 1 };
const GREEN_MONO: Feel = { hue: 0.35, colorize: 0.75, speed: 65, saturation: 1.10, contrast: 1.05, intensity: 1 };

// ── Simple solid-colour fills ──────────────────────────────────────────────
// Each "simple" effect is the same noise-fill shader; colour comes from the
// post-process tint. The 4 slots share a base hue (slight hue/saturation
// variation) but differ widely in speed, so they read as distinct motion
// while staying the same colour. colorize=1 = full tint.
const SIMPLE_HUES: Record<string, number> = {
  simplered:    0.00,
  simpleorange: 0.05,
  simpleyellow: 0.14,
  simplegreen:  0.33,
  simplecyan:   0.50,
  simpleblue:   0.62,
  simpleviolet: 0.75,
  simplepink:   0.92,
};

const norm1 = (h: number): number => ((h % 1) + 1) % 1;
const simpleColorFeels = (hue: number): [Feel, Feel, Feel, Feel] => {
  const base = (h: number, saturation: number, speed: number, contrast = 1.0): Feel =>
    ({ hue: norm1(h), colorize: 1, speed, saturation, contrast, intensity: 1 });
  return [
    base(hue,         1.10, 30),        // balanced default - moderate drift
    base(hue + 0.015, 1.70, 75, 1.05),  // highly saturated - fast
    base(hue - 0.020, 0.55, 12),        // desaturated - near-still
    base(hue + 0.030, 1.35, 100),       // rich, slight hue offset - fastest
  ];
};

function simpleFeelsFor(key: string): [Feel, Feel, Feel, Feel] | null {
  const hue = SIMPLE_HUES[key];
  return hue === undefined ? null : simpleColorFeels(hue);
}

function isRainbowSignature(f: Feel): boolean {
  return Math.abs(f.hue) < 1e-4 && Math.abs(f.colorize) < 1e-4;
}

// True for signatures that ship with the saturation post-process pinned to
// (near-)zero, i.e. the effect's stock template is monochrome on purpose.
// Used to surface RAINBOW in slot 1 instead of WARM_MONO so the user can
// jump straight to the full-spectrum variant.
function isMonochromeSignature(f: Feel): boolean {
  return f.saturation < 0.05;
}

/**
 * Per-effect signature. Slot 0 of each bundle. Values were picked to
 * read as the effect's canonical look: warm-orange for fire / lava /
 * bursts, classic greens for matrix / radar / aurora, violet-magenta
 * for nebula / sacredgeometry, cool blues for wave / pulse, etc.
 *
 * Effects that are palette-driven by nature (rainbow, kaleidoscope,
 * chromaspiral, mandelbrot, spiral, gradientwave) keep hue=0 colorize=0
 * so their signature IS the full rainbow; the signature table just
 * makes that explicit.
 */
const SIGNATURES: Record<string, Feel> = {
  rainbow:        RAINBOW,
  fire:           { hue: 0.03, colorize: 0.80, speed: 70, saturation: 1.10, contrast: 1.05, intensity: 1 },
  plasma:         { hue: 0.85, colorize: 0.30, speed: 60, saturation: 1.00, contrast: 1.00, intensity: 1 },
  spiral:         RAINBOW,
  matrix:         { hue: 0.33, colorize: 0.75, speed: 80, saturation: 1.10, contrast: 1.10, intensity: 1 },
  meteor:         { hue: 0.10, colorize: 0.40, speed: 85, saturation: 1.05, contrast: 1.00, intensity: 1 },
  ripple:         { hue: 0.55, colorize: 0.30, speed: 55, saturation: 1.00, contrast: 1.00, intensity: 1 },
  wave:           { hue: 0.58, colorize: 0.45, speed: 50, saturation: 1.00, contrast: 1.00, intensity: 1 },
  gradientwave:   RAINBOW,
  ball:           { hue: 0.12, colorize: 0.25, speed: 60, saturation: 1.05, contrast: 1.00, intensity: 1 },
  radar:          { hue: 0.33, colorize: 0.60, speed: 55, saturation: 1.05, contrast: 1.05, intensity: 1 },
  pulse:          { hue: 0.55, colorize: 0.45, speed: 60, saturation: 1.00, contrast: 1.00, intensity: 1 },
  watercolor:     { hue: 0.50, colorize: 0.30, speed: 40, saturation: 1.00, contrast: 1.00, intensity: 1 },
  jellyfish:      { hue: 0.48, colorize: 0.35, speed: 45, saturation: 1.00, contrast: 1.00, intensity: 1 },
  aurora:         { hue: 0.33, colorize: 0.35, speed: 45, saturation: 1.05, contrast: 1.00, intensity: 1 },
  lavalamp:       { hue: 0.85, colorize: 0.50, speed: 35, saturation: 1.00, contrast: 1.00, intensity: 1 },
  starfield:      { hue: 0.60, colorize: 0.25, speed: 55, saturation: 1.00, contrast: 1.00, intensity: 1 },
  voronoi:        { hue: 0.40, colorize: 0.50, speed: 40, saturation: 1.05, contrast: 1.00, intensity: 1 },
  neonrain:       { hue: 0.88, colorize: 0.50, speed: 85, saturation: 1.10, contrast: 1.05, intensity: 1 },
  nebula:         { hue: 0.72, colorize: 0.35, speed: 30, saturation: 1.00, contrast: 1.00, intensity: 1 },
  bursts:         { hue: 0.08, colorize: 0.50, speed: 65, saturation: 1.05, contrast: 1.00, intensity: 1 },
  lavafissure:    { hue: 0.03, colorize: 0.45, speed: 40, saturation: 1.05, contrast: 1.05, intensity: 1 },
  kaleidoscope:   RAINBOW,
  wormhole:       { hue: 0.78, colorize: 0.40, speed: 70, saturation: 1.00, contrast: 1.00, intensity: 1 },
  interference:   { hue: 0.60, colorize: 0.55, speed: 65, saturation: 1.25, contrast: 1.15, intensity: 1 },
  sacredgeometry: { hue: 0.80, colorize: 0.30, speed: 50, saturation: 1.00, contrast: 1.00, intensity: 1 },
  tessellation:   { hue: 0.55, colorize: 0.45, speed: 55, saturation: 1.00, contrast: 1.00, intensity: 1 },
  domainwarp:     { hue: 0.70, colorize: 0.50, speed: 45, saturation: 1.15, contrast: 1.10, intensity: 1 },
  inkbloom:       { hue: 0.72, colorize: 0.50, speed: 50, saturation: 1.00, contrast: 1.00, intensity: 1 },
  cosmicdust:     { hue: 0.75, colorize: 0.35, speed: 35, saturation: 1.00, contrast: 1.00, intensity: 1 },
  chromaspiral:   RAINBOW,
  neongrid:       { hue: 0.58, colorize: 0.55, speed: 70, saturation: 1.20, contrast: 1.10, intensity: 1 },
  oilslick:       RAINBOW,
  caustics:       { hue: 0.55, colorize: 0.30, speed: 35, saturation: 1.20, contrast: 1.10, intensity: 1 },
  galaxy:         { hue: 0.72, colorize: 0.20, speed: 45, saturation: 1.20, contrast: 1.10, intensity: 1 },
  starpath:       { hue: 0.62, colorize: 0.20, speed: 40, saturation: 1.10, contrast: 1.10, intensity: 1 },
  plasmaglobe:    { hue: 0.78, colorize: 0.30, speed: 60, saturation: 1.20, contrast: 1.10, intensity: 1 },
  lightning:      { hue: 0.60, colorize: 0.30, speed: 60, saturation: 1.15, contrast: 1.20, intensity: 1 },
  flowfield:      RAINBOW,
  ferrofluid:     { hue: 0.78, colorize: 0.30, speed: 50, saturation: 1.15, contrast: 1.10, intensity: 1 },
  liquidchrome:   { hue: 0.60, colorize: 0.20, speed: 45, saturation: 1.15, contrast: 1.20, intensity: 1 },
  hextunnel:      { hue: 0.55, colorize: 0.40, speed: 65, saturation: 1.20, contrast: 1.10, intensity: 1 },
  mandelbrot:     RAINBOW,
  circuit:        { hue: 0.40, colorize: 0.50, speed: 60, saturation: 1.20, contrast: 1.10, intensity: 1 },
  bokeh:          { hue: 0.55, colorize: 0.20, speed: 55, saturation: 1.15, contrast: 1.05, intensity: 1 },
  sandstorm:      { hue: 0.07, colorize: 0.55, speed: 50, saturation: 1.20, contrast: 1.10, intensity: 1 },
  dotmatrix:      RAINBOW,
  bubbles:        { hue: 0.55, colorize: 0.15, speed: 40, saturation: 1.15, contrast: 1.10, intensity: 1 },
  silkwave:       { hue: 0.82, colorize: 0.30, speed: 50, saturation: 1.20, contrast: 1.10, intensity: 1 },
  // Stock template ships as monochrome high-contrast so the sharp band
  // edges read crisp; slot 1 surfaces the rainbow variant.
  prismwave:      { hue: 0.00, colorize: 0.00, speed: 55, saturation: 0.00, contrast: 1.65, intensity: 1 },
  crystaltunnel:  { hue: 0.62, colorize: 0.30, speed: 60, saturation: 1.20, contrast: 1.15, intensity: 1 },
  ribbonflow:     { hue: 0.05, colorize: 0.40, speed: 65, saturation: 1.15, contrast: 1.05, intensity: 1 },
  // Tunnels + flowy + abstract backgrounds. Must match SignatureFor in LightingProvider.cs.
  ringtunnel:     { hue: 0.50, colorize: 0.40, speed: 65, saturation: 1.20, contrast: 1.10, intensity: 1 },
  vortextunnel:   { hue: 0.72, colorize: 0.30, speed: 55, saturation: 1.15, contrast: 1.10, intensity: 1 },
  helixtunnel:    { hue: 0.45, colorize: 0.35, speed: 60, saturation: 1.15, contrast: 1.10, intensity: 1 },
  boxtunnel:      { hue: 0.80, colorize: 0.35, speed: 60, saturation: 1.20, contrast: 1.15, intensity: 1 },
  meshgradient:   { hue: 0.00, colorize: 0.00, speed: 45, saturation: 1.00, contrast: 1.00, intensity: 1 },
  tide:           { hue: 0.58, colorize: 0.40, speed: 50, saturation: 1.05, contrast: 1.00, intensity: 1 },
  vapor:          { hue: 0.60, colorize: 0.45, speed: 45, saturation: 0.95, contrast: 1.05, intensity: 1 },
  satinflow:      { hue: 0.88, colorize: 0.30, speed: 50, saturation: 1.15, contrast: 1.10, intensity: 1 },
  ridgeline:      { hue: 0.55, colorize: 0.30, speed: 50, saturation: 1.10, contrast: 1.10, intensity: 1 },
  chevron:        { hue: 0.08, colorize: 0.45, speed: 60, saturation: 1.20, contrast: 1.10, intensity: 1 },
  terrace:        { hue: 0.40, colorize: 0.35, speed: 45, saturation: 1.15, contrast: 1.10, intensity: 1 },
  harlequin:      { hue: 0.92, colorize: 0.40, speed: 55, saturation: 1.20, contrast: 1.10, intensity: 1 },
  mosaic:         { hue: 0.55, colorize: 0.30, speed: 55, saturation: 1.20, contrast: 1.10, intensity: 1 },
  // Audio-reactive set.
  spectrumbars:   RAINBOW,
  spectrumradial: RAINBOW,
  scope:          { hue: 0.55, colorize: 0.35, speed: 60, saturation: 1.10, contrast: 1.10, intensity: 1 },
  basspulse:      { hue: 0.78, colorize: 0.40, speed: 50, saturation: 1.15, contrast: 1.15, intensity: 1 },
  beatstrobe:     RAINBOW,
  harmonicstar:   { hue: 0.60, colorize: 0.30, speed: 55, saturation: 1.15, contrast: 1.10, intensity: 1 },
  audiotunnel:    { hue: 0.45, colorize: 0.35, speed: 60, saturation: 1.15, contrast: 1.10, intensity: 1 },
  bassbloom:      { hue: 0.85, colorize: 0.35, speed: 45, saturation: 1.15, contrast: 1.10, intensity: 1 },
  beatbuilder:    { hue: 0.00, colorize: 0.00, speed: 50, saturation: 1.00, contrast: 1.00, intensity: 1 },
};

/**
 * Per-effect uniform overrides for each of the 4 template slots. Slot 0
 * is the canonical param set for that effect (fire turbulence, mandelbrot
 * default zoom, etc.) so the signature thumbnail shows the baseline shape;
 * slots 1/2/3 push the uniforms to different extremes for visual variety.
 */
const PARAM_VARIATIONS: Record<string, [Record<string, number>, Record<string, number>, Record<string, number>, Record<string, number>]> = {
  rainbow: [
    { u_density: 1.0 },  { u_density: 2.5 },  { u_density: 0.5 },  { u_density: 1.6 },
  ],
  plasma: [
    { u_warp: 1.0, u_zoom: 1.0 },
    { u_warp: 2.0, u_zoom: 0.7 },
    { u_warp: 0.3, u_zoom: 1.8 },
    { u_warp: 1.5, u_zoom: 2.2 },
  ],
  fire: [
    { u_turbulence: 1.6 }, { u_turbulence: 2.6 }, { u_turbulence: 1.1 }, { u_turbulence: 2.1 },
  ],
  spiral: [
    { u_arms: 5, u_tightness: 8 },
    { u_arms: 8, u_tightness: 12 },
    { u_arms: 3, u_tightness: 5 },
    { u_arms: 6, u_tightness: 4 },
  ],
  matrix: [
    { u_columns: 28, u_fade: 4 },
    { u_columns: 50, u_fade: 2 },
    { u_columns: 14, u_fade: 8 },
    { u_columns: 35, u_fade: 3 },
  ],
  meteor: [
    { u_streaks: 6,  u_width: 0.13 },
    { u_streaks: 12, u_width: 0.08 },
    { u_streaks: 3,  u_width: 0.25 },
    { u_streaks: 8,  u_width: 0.15 },
  ],
  ripple: [
    { u_freq: 12 }, { u_freq: 24 }, { u_freq: 6 }, { u_freq: 18 },
  ],
  wave: [
    { u_freq: 8,  u_amp: 0.18 },
    { u_freq: 14, u_amp: 0.32 },
    { u_freq: 4,  u_amp: 0.10 },
    { u_freq: 10, u_amp: 0.25 },
  ],
  gradientwave: [
    { u_freq: 6 }, { u_freq: 12 }, { u_freq: 3 }, { u_freq: 9 },
  ],
  ball: [
    { u_count: 8,  u_size: 0.08 },
    { u_count: 16, u_size: 0.05 },
    { u_count: 3,  u_size: 0.20 },
    { u_count: 10, u_size: 0.12 },
  ],
  radar: [
    { u_ringRate: 0.25 }, { u_ringRate: 0.60 }, { u_ringRate: 0.10 }, { u_ringRate: 0.40 },
  ],
  pulse: [
    { u_size: 1.2 }, { u_size: 1.8 }, { u_size: 0.6 }, { u_size: 1.4 },
  ],
  watercolor: [
    { u_blobs: 6,  u_softness: 0.5 },
    { u_blobs: 10, u_softness: 0.3 },
    { u_blobs: 3,  u_softness: 0.9 },
    { u_blobs: 8,  u_softness: 0.6 },
  ],
  jellyfish: [
    { u_count: 3, u_glow: 1.0 },
    { u_count: 6, u_glow: 2.2 },
    { u_count: 1, u_glow: 0.5 },
    { u_count: 4, u_glow: 1.6 },
  ],
  aurora: [
    { u_curtains: 4, u_height: 0.55, u_shimmer: 0.5 },
    { u_curtains: 8, u_height: 0.90, u_shimmer: 1.0 },
    { u_curtains: 2, u_height: 0.30, u_shimmer: 0.15 },
    { u_curtains: 6, u_height: 0.70, u_shimmer: 0.75 },
  ],
  lavalamp: [
    { u_count: 5, u_viscosity: 0.45, u_size: 0.22 },
    { u_count: 9, u_viscosity: 0.80, u_size: 0.32 },
    { u_count: 3, u_viscosity: 0.20, u_size: 0.40 },
    { u_count: 6, u_viscosity: 0.50, u_size: 0.28 },
  ],
  starfield: [
    { u_density: 30, u_layers: 4, u_trail: 0.50 },
    { u_density: 55, u_layers: 7, u_trail: 1.00 },
    { u_density: 12, u_layers: 2, u_trail: 0.15 },
    { u_density: 40, u_layers: 5, u_trail: 0.70 },
  ],
  voronoi: [
    { u_scale: 3.0, u_edgeWidth: 0.05, u_drift: 0.60 },
    { u_scale: 5.5, u_edgeWidth: 0.03, u_drift: 1.00 },
    { u_scale: 1.5, u_edgeWidth: 0.12, u_drift: 0.20 },
    { u_scale: 4.0, u_edgeWidth: 0.07, u_drift: 0.50 },
  ],
  neonrain: [
    { u_density: 35, u_length: 0.15, u_splash: 0.60 },
    { u_density: 70, u_length: 0.08, u_splash: 1.00 },
    { u_density: 18, u_length: 0.35, u_splash: 0.20 },
    { u_density: 45, u_length: 0.20, u_splash: 0.70 },
  ],
  bursts: [
    { u_rate: 1.2, u_particles: 10, u_size: 0.80 },
    { u_rate: 4.0, u_particles: 16, u_size: 0.50 },
    { u_rate: 0.4, u_particles: 6,  u_size: 1.50 },
    { u_rate: 2.0, u_particles: 14, u_size: 1.00 },
  ],
  nebula: [
    { u_density: 1.0, u_stars: 0.60, u_depth: 4 },
    { u_density: 1.8, u_stars: 1.00, u_depth: 6 },
    { u_density: 0.5, u_stars: 0.20, u_depth: 2 },
    { u_density: 1.3, u_stars: 0.70, u_depth: 5 },
  ],
  lavafissure: [
    { u_flow: 1.0, u_crackWidth: 0.35, u_shimmer: 0.6 },
    { u_flow: 2.0, u_crackWidth: 0.15, u_shimmer: 1.2 },
    { u_flow: 0.4, u_crackWidth: 0.60, u_shimmer: 0.2 },
    { u_flow: 1.4, u_crackWidth: 0.35, u_shimmer: 0.8 },
  ],
  kaleidoscope: [
    { u_sides: 8,  u_spin: 0.4,  u_inner: 1.2 },
    { u_sides: 6,  u_spin: 1.6,  u_inner: 2.2 },
    { u_sides: 12, u_spin: -0.2, u_inner: 0.6 },
    { u_sides: 4,  u_spin: 0.9,  u_inner: 1.5 },
  ],
  wormhole: [
    { u_depth: 1.2, u_rings: 5,  u_twist: 0.6 },
    { u_depth: 2.5, u_rings: 10, u_twist: 1.6 },
    { u_depth: 0.5, u_rings: 3,  u_twist: -0.3 },
    { u_depth: 1.8, u_rings: 7,  u_twist: 0.9 },
  ],
  interference: [
    { u_wavelength: 0.4, u_sources: 4 },
    { u_wavelength: 0.12, u_sources: 8 },
    { u_wavelength: 0.8, u_sources: 2 },
    { u_wavelength: 0.3, u_sources: 5 },
  ],
  sacredgeometry: [
    { u_layers: 5, u_edge: 0.60, u_pulse: 1.0 },
    { u_layers: 8, u_edge: 0.30, u_pulse: 2.4 },
    { u_layers: 3, u_edge: 1.00, u_pulse: 0.4 },
    { u_layers: 6, u_edge: 0.50, u_pulse: 1.5 },
  ],
  tessellation: [
    { u_shape: 0, u_morph: 0.6, u_edge: 0.15 },
    { u_shape: 1, u_morph: 1.2, u_edge: 0.08 },
    { u_shape: 2, u_morph: 0.2, u_edge: 0.30 },
    { u_shape: 0, u_morph: 0.9, u_edge: 0.12 },
  ],
  domainwarp: [
    { u_turbulence: 0.80, u_direction:  0.00, u_bite: 1.0 },
    { u_turbulence: 1.60, u_direction:  1.57, u_bite: 1.8 },
    { u_turbulence: 0.35, u_direction: -0.80, u_bite: 0.5 },
    { u_turbulence: 1.20, u_direction:  3.14, u_bite: 1.3 },
  ],
  inkbloom: [
    { u_spread: 1.0, u_curl: 0.6, u_fade: 0.7 },
    { u_spread: 1.8, u_curl: 1.5, u_fade: 1.2 },
    { u_spread: 0.4, u_curl: 0.2, u_fade: 2.0 },
    { u_spread: 1.3, u_curl: 0.9, u_fade: 0.9 },
  ],
  cosmicdust: [
    { u_particles: 1.0, u_twinkle: 1.5, u_parallax: 0.60 },
    { u_particles: 2.5, u_twinkle: 3.5, u_parallax: 1.10 },
    { u_particles: 0.4, u_twinkle: 0.5, u_parallax: 0.10 },
    { u_particles: 1.5, u_twinkle: 2.0, u_parallax: 0.80 },
  ],
  chromaspiral: [
    { u_tightness: 5,  u_spin:  1.0, u_bands: 3 },
    { u_tightness: 10, u_spin:  2.5, u_bands: 12 },
    { u_tightness: 2,  u_spin: -0.4, u_bands: 6 },
    { u_tightness: 7,  u_spin:  1.2, u_bands: 8 },
  ],
  neongrid: [
    { u_density: 12, u_pulse: 1.2, u_glow: 1.2 },
    { u_density: 22, u_pulse: 2.0, u_glow: 1.8 },
    { u_density: 6,  u_pulse: 0.4, u_glow: 0.6 },
    { u_density: 16, u_pulse: 1.6, u_glow: 1.0 },
  ],
  oilslick: [
    { u_flow: 1.5, u_iridescence: 2.5, u_scale: 1.5 },
    { u_flow: 2.8, u_iridescence: 3.8, u_scale: 2.2 },
    { u_flow: 0.5, u_iridescence: 1.0, u_scale: 0.6 },
    { u_flow: 1.8, u_iridescence: 3.0, u_scale: 1.0 },
  ],
  caustics: [
    { u_density: 1.4, u_brightness: 1.0, u_flow: 1.0 },
    { u_density: 2.4, u_brightness: 1.6, u_flow: 1.8 },
    { u_density: 0.8, u_brightness: 0.6, u_flow: 0.4 },
    { u_density: 1.8, u_brightness: 1.2, u_flow: 1.2 },
  ],
  galaxy: [
    { u_arms: 4, u_dust: 0.8, u_rotation: 0.5, u_stars: 1.2 },
    { u_arms: 6, u_dust: 1.4, u_rotation: 1.2, u_stars: 2.0 },
    { u_arms: 2, u_dust: 0.3, u_rotation: 0.2, u_stars: 0.5 },
    { u_arms: 5, u_dust: 1.0, u_rotation: 0.8, u_stars: 1.6 },
  ],
  starpath: [
    { u_trail: 0.6, u_axisShift: 0.3, u_brightness: 1.0 },
    { u_trail: 1.2, u_axisShift: 0.6, u_brightness: 1.6 },
    { u_trail: 0.2, u_axisShift: 0.0, u_brightness: 0.7 },
    { u_trail: 0.9, u_axisShift: 0.4, u_brightness: 1.2 },
  ],
  plasmaglobe: [
    { u_branches: 7,  u_jitter: 1.0, u_power: 1.0 },
    { u_branches: 12, u_jitter: 1.8, u_power: 1.6 },
    { u_branches: 4,  u_jitter: 0.4, u_power: 0.6 },
    { u_branches: 9,  u_jitter: 1.3, u_power: 1.2 },
  ],
  lightning: [
    { u_boltRate: 0.8, u_forks: 3, u_glow: 1.0 },
    { u_boltRate: 2.0, u_forks: 6, u_glow: 1.6 },
    { u_boltRate: 0.4, u_forks: 1, u_glow: 0.6 },
    { u_boltRate: 1.2, u_forks: 4, u_glow: 1.2 },
  ],
  flowfield: [
    { u_streams: 1.5, u_flow: 1.0, u_colorSpread: 0.6 },
    { u_streams: 2.5, u_flow: 2.0, u_colorSpread: 1.2 },
    { u_streams: 0.8, u_flow: 0.4, u_colorSpread: 0.2 },
    { u_streams: 1.8, u_flow: 1.4, u_colorSpread: 0.8 },
  ],
  ferrofluid: [
    { u_density: 8,  u_sharpness: 1.5, u_motion: 1.0 },
    { u_density: 12, u_sharpness: 2.5, u_motion: 1.6 },
    { u_density: 5,  u_sharpness: 0.7, u_motion: 0.4 },
    { u_density: 10, u_sharpness: 1.8, u_motion: 1.2 },
  ],
  liquidchrome: [
    { u_flow: 1.0, u_thickness: 1.0, u_ripple: 1.0 },
    { u_flow: 2.0, u_thickness: 1.6, u_ripple: 2.0 },
    { u_flow: 0.4, u_thickness: 0.5, u_ripple: 0.5 },
    { u_flow: 1.4, u_thickness: 1.3, u_ripple: 1.3 },
  ],
  hextunnel: [
    { u_cellSize: 0.15, u_zoomRate: 1.0, u_neon: 1.0 },
    { u_cellSize: 0.08, u_zoomRate: 2.2, u_neon: 1.6 },
    { u_cellSize: 0.30, u_zoomRate: 0.5, u_neon: 0.5 },
    { u_cellSize: 0.20, u_zoomRate: 1.4, u_neon: 1.2 },
  ],
  mandelbrot: [
    { u_depth: 4, u_rotation: 0.5, u_brightness: 1.0 },
    { u_depth: 6, u_rotation: 1.5, u_brightness: 1.6 },
    { u_depth: 2, u_rotation: 0.2, u_brightness: 0.6 },
    { u_depth: 5, u_rotation: 0.8, u_brightness: 1.2 },
  ],
  circuit: [
    { u_density: 9,  u_pulse: 1.0, u_glow: 1.0 },
    { u_density: 14, u_pulse: 2.0, u_glow: 1.6 },
    { u_density: 5,  u_pulse: 0.5, u_glow: 0.5 },
    { u_density: 11, u_pulse: 1.4, u_glow: 1.2 },
  ],
  bokeh: [
    { u_lights: 16, u_size: 0.15, u_drift: 1.0 },
    { u_lights: 25, u_size: 0.22, u_drift: 1.8 },
    { u_lights: 8,  u_size: 0.08, u_drift: 0.3 },
    { u_lights: 20, u_size: 0.18, u_drift: 1.3 },
  ],
  sandstorm: [
    { u_wind: 1.2, u_density: 1.0, u_gusts: 0.8 },
    { u_wind: 2.4, u_density: 1.8, u_gusts: 1.6 },
    { u_wind: 0.5, u_density: 0.5, u_gusts: 0.2 },
    { u_wind: 1.6, u_density: 1.3, u_gusts: 1.1 },
  ],
  dotmatrix: [
    { u_density: 18, u_scrollRate: 1.0, u_complexity: 0.5 },
    { u_density: 26, u_scrollRate: 2.0, u_complexity: 1.0 },
    { u_density: 10, u_scrollRate: 0.4, u_complexity: 0.0 },
    { u_density: 22, u_scrollRate: 1.4, u_complexity: 0.7 },
  ],
  bubbles: [
    { u_count: 12, u_rise: 1.0, u_irid: 0.8 },
    { u_count: 22, u_rise: 2.0, u_irid: 1.3 },
    { u_count: 5,  u_rise: 0.3, u_irid: 0.3 },
    { u_count: 16, u_rise: 1.3, u_irid: 1.0 },
  ],
  silkwave: [
    { u_folds: 6,  u_flow: 1.2, u_sheen: 1.0 },
    { u_folds: 10, u_flow: 2.0, u_sheen: 1.7 },
    { u_folds: 3,  u_flow: 0.4, u_sheen: 0.3 },
    { u_folds: 8,  u_flow: 1.6, u_sheen: 1.3 },
  ],
  prismwave: [
    { u_bands: 4,  u_sharpness: 7.0, u_thickness: 0.60, u_drift: 0.65 },
    { u_bands: 8,  u_sharpness: 8.0, u_thickness: 0.55, u_drift: 0.85 },
    { u_bands: 2,  u_sharpness: 4.0, u_thickness: 0.75, u_drift: 0.40 },
    { u_bands: 6,  u_sharpness: 6.5, u_thickness: 0.65, u_drift: 0.75 },
  ],
  crystaltunnel: [
    { u_facets: 8,  u_depth: 1.0, u_refract: 1.0 },
    { u_facets: 12, u_depth: 1.8, u_refract: 1.6 },
    { u_facets: 5,  u_depth: 0.6, u_refract: 0.4 },
    { u_facets: 10, u_depth: 1.3, u_refract: 1.2 },
  ],
  ribbonflow: [
    { u_ribbons: 7,  u_turbulence: 1.2, u_glow: 1.0 },
    { u_ribbons: 12, u_turbulence: 2.4, u_glow: 1.6 },
    { u_ribbons: 3,  u_turbulence: 0.6, u_glow: 0.5 },
    { u_ribbons: 9,  u_turbulence: 1.5, u_glow: 1.2 },
  ],
  ringtunnel: [
    { u_rings: 2.0, u_zoom: 1.0, u_neon: 1.0 },
    { u_rings: 3.5, u_zoom: 2.2, u_neon: 1.6 },
    { u_rings: 1.0, u_zoom: 0.5, u_neon: 0.6 },
    { u_rings: 2.5, u_zoom: 1.4, u_neon: 1.2 },
  ],
  vortextunnel: [
    { u_twist: 0.8, u_churn: 1.0, u_depth: 1.2 },
    { u_twist: 1.8, u_churn: 1.8, u_depth: 2.0 },
    { u_twist: 0.2, u_churn: 0.5, u_depth: 0.6 },
    { u_twist: 1.2, u_churn: 1.3, u_depth: 1.4 },
  ],
  helixtunnel: [
    { u_pitch: 3, u_strands: 2, u_glow: 1.0 },
    { u_pitch: 5, u_strands: 3, u_glow: 1.6 },
    { u_pitch: 2, u_strands: 2, u_glow: 0.6 },
    { u_pitch: 4, u_strands: 4, u_glow: 1.2 },
  ],
  boxtunnel: [
    { u_depth: 1.2, u_square: 1.0, u_glow: 1.0 },
    { u_depth: 2.2, u_square: 1.0, u_glow: 1.6 },
    { u_depth: 0.7, u_square: 0.0, u_glow: 0.6 },
    { u_depth: 1.5, u_square: 0.5, u_glow: 1.2 },
  ],
  meshgradient: [
    { u_blobs: 5, u_spread: 0.8, u_softness: 0.8 },
    { u_blobs: 6, u_spread: 1.1, u_softness: 1.2 },
    { u_blobs: 3, u_spread: 0.5, u_softness: 0.5 },
    { u_blobs: 5, u_spread: 0.9, u_softness: 1.0 },
  ],
  tide: [
    { u_layers: 5, u_amp: 0.08, u_freq: 4 },
    { u_layers: 7, u_amp: 0.14, u_freq: 6 },
    { u_layers: 2, u_amp: 0.04, u_freq: 2 },
    { u_layers: 5, u_amp: 0.10, u_freq: 5 },
  ],
  vapor: [
    { u_density: 1.0, u_scale: 1.5, u_drift: 1.0 },
    { u_density: 1.8, u_scale: 2.4, u_drift: 1.8 },
    { u_density: 0.5, u_scale: 0.8, u_drift: 0.4 },
    { u_density: 1.3, u_scale: 1.6, u_drift: 1.2 },
  ],
  satinflow: [
    { u_folds: 5, u_flow: 1.0, u_sheen: 1.0 },
    { u_folds: 8, u_flow: 1.8, u_sheen: 1.6 },
    { u_folds: 2, u_flow: 0.5, u_sheen: 0.5 },
    { u_folds: 6, u_flow: 1.3, u_sheen: 1.2 },
  ],
  ridgeline: [
    { u_layers: 5, u_jag: 4, u_height: 0.18 },
    { u_layers: 7, u_jag: 6, u_height: 0.30 },
    { u_layers: 3, u_jag: 2, u_height: 0.10 },
    { u_layers: 6, u_jag: 5, u_height: 0.22 },
  ],
  chevron: [
    { u_bands: 14, u_angle: 1.0, u_width: 0.18 },
    { u_bands: 28, u_angle: 1.6, u_width: 0.30 },
    { u_bands: 6,  u_angle: 0.4, u_width: 0.10 },
    { u_bands: 18, u_angle: 1.2, u_width: 0.22 },
  ],
  terrace: [
    { u_levels: 8,  u_scale: 1.4, u_line: 0.5 },
    { u_levels: 14, u_scale: 2.2, u_line: 1.0 },
    { u_levels: 4,  u_scale: 0.8, u_line: 0.0 },
    { u_levels: 10, u_scale: 1.6, u_line: 0.7 },
  ],
  harlequin: [
    { u_cells: 8,  u_skew: 1.0, u_shift: 1.0 },
    { u_cells: 14, u_skew: 1.4, u_shift: 1.8 },
    { u_cells: 4,  u_skew: 0.6, u_shift: 0.4 },
    { u_cells: 10, u_skew: 1.0, u_shift: 1.3 },
  ],
  mosaic: [
    { u_cells: 9,  u_wave: 1.5, u_pop: 0.7 },
    { u_cells: 14, u_wave: 2.6, u_pop: 1.2 },
    { u_cells: 5,  u_wave: 0.8, u_pop: 0.3 },
    { u_cells: 11, u_wave: 1.8, u_pop: 0.9 },
  ],
  spectrumbars: [
    { u_bars: 16, u_gap: 0.12, u_glow: 1.0 },
    { u_bars: 12, u_gap: 0.20, u_glow: 1.5 },
    { u_bars: 16, u_gap: 0.04, u_glow: 0.6 },
    { u_bars: 10, u_gap: 0.15, u_glow: 1.2 },
  ],
  spectrumradial: [
    { u_spokes: 32, u_radius: 0.10, u_glow: 1.0 },
    { u_spokes: 48, u_radius: 0.05, u_glow: 1.4 },
    { u_spokes: 20, u_radius: 0.20, u_glow: 0.7 },
    { u_spokes: 36, u_radius: 0.12, u_glow: 1.2 },
  ],
  scope: [
    { u_thickness: 0.012, u_harmonics: 3, u_glow: 1.0 },
    { u_thickness: 0.004, u_harmonics: 5, u_glow: 1.6 },
    { u_thickness: 0.028, u_harmonics: 1, u_glow: 0.6 },
    { u_thickness: 0.016, u_harmonics: 4, u_glow: 1.2 },
  ],
  basspulse: [
    { u_rings: 5, u_ringSpeed: 1.0, u_halo: 1.0 },
    { u_rings: 8, u_ringSpeed: 2.0, u_halo: 1.6 },
    { u_rings: 2, u_ringSpeed: 0.5, u_halo: 0.6 },
    { u_rings: 6, u_ringSpeed: 1.4, u_halo: 1.2 },
  ],
  beatstrobe: [
    { u_stripes: 7,  u_flash: 1.2, u_chroma: 0.5 },
    { u_stripes: 14, u_flash: 2.2, u_chroma: 1.0 },
    { u_stripes: 4,  u_flash: 0.6, u_chroma: 0.1 },
    { u_stripes: 10, u_flash: 1.5, u_chroma: 0.7 },
  ],
  harmonicstar: [
    { u_points: 12, u_core: 0.10, u_flare: 1.0 },
    { u_points: 16, u_core: 0.08, u_flare: 1.6 },
    { u_points: 6,  u_core: 0.20, u_flare: 0.4 },
    { u_points: 10, u_core: 0.12, u_flare: 1.2 },
  ],
  audiotunnel: [
    { u_ringDensity: 6,  u_twist: 0.8, u_neon: 1.0 },
    { u_ringDensity: 10, u_twist: 1.8, u_neon: 1.6 },
    { u_ringDensity: 3,  u_twist: 0.2, u_neon: 0.6 },
    { u_ringDensity: 8,  u_twist: 1.2, u_neon: 1.2 },
  ],
  bassbloom: [
    { u_petals: 7,  u_shimmer: 1.0, u_bloomSize: 0.4 },
    { u_petals: 10, u_shimmer: 1.8, u_bloomSize: 0.55 },
    { u_petals: 4,  u_shimmer: 0.3, u_bloomSize: 0.3 },
    { u_petals: 8,  u_shimmer: 1.3, u_bloomSize: 0.45 },
  ],
  beatbuilder: [
    { u_centerStyle: 3, u_colorMode: 1, u_barWidth: 0.85, u_centerSize: 0.9, u_beatPulse: 0.3 },
    { u_centerStyle: 0, u_colorMode: 0, u_barCount: 56, u_barWidth: 0.8, u_centerGain: 1.3, u_flash: 0.5, u_beatPulse: 0.5 },
    { u_centerStyle: 2, u_colorMode: 0, u_centerGain: 1.5, u_hueCycle: 0.6, u_flash: 0.9, u_beatColor: 0.6, u_bgLevel: 0.1 },
    { u_centerStyle: 1, u_colorMode: 0, u_centerSize: 0.95, u_beatPulse: 0.6, u_beatColor: 0.5, u_bgLevel: 0.15 },
  ],
};

/**
 * Given the signature for an effect, return the four feels in the order
 * they should populate slots 0..3. If the signature is already rainbow,
 * slots 1/2/3 become warm / cool / green to add variety. Otherwise slot
 * 1 is rainbow (so every coloured-signature effect has a one-click path
 * to "show the full spectrum"), and slots 2/3 are the two monos.
 */
function feelsForSignature(sig: Feel): [Feel, Feel, Feel, Feel] {
  if (isRainbowSignature(sig)) {
    // Monochrome stock template: keep the BW look in slot 0, full rainbow
    // in slot 1.
    if (isMonochromeSignature(sig)) {
      return [sig, RAINBOW, WARM_MONO, COOL_MONO];
    }
    return [sig, WARM_MONO, COOL_MONO, GREEN_MONO];
  }
  return [sig, RAINBOW, WARM_MONO, COOL_MONO];
}

/**
 * Build the default 4-slot template bundle for an effect. Used on first
 * hydration and when merging a partial server state.
 */
export function buildDefaultTemplates(effectKey: string): EffectTemplateBundle {
  const baseParams = defaultParamsFor(effectKey);
  const variations = PARAM_VARIATIONS[effectKey];
  const signature = SIGNATURES[effectKey] ?? RAINBOW;
  // Simple fills carry their own 4 same-colour feels; everything else derives
  // its slots from the signature (rainbow / warm / cool / green logic).
  const feels = simpleFeelsFor(effectKey) ?? feelsForSignature(signature);
  const slots: EffectState[] = feels.map((feel, i) => {
    const overrides = variations?.[i] ?? {};
    return {
      speed: feel.speed,
      intensity: feel.intensity,
      hue: feel.hue,
      colorize: feel.colorize,
      saturation: feel.saturation,
      contrast: feel.contrast,
      params: { ...baseParams, ...overrides },
    };
  });
  return { selected: 0, slots };
}

/** Build defaults for every registered effect (first-time hydrate). */
export function buildAllDefaultTemplates(): Record<string, EffectTemplateBundle> {
  const out: Record<string, EffectTemplateBundle> = {};
  for (const fx of EFFECTS) out[fx.key] = buildDefaultTemplates(fx.key);
  return out;
}

/**
 * Merge a server-side template bundle into the built-in defaults. Any slot
 * the server provides wins; missing slots are back-filled from defaults so
 * we always present the user with a full row of 4 usable presets.
 */
export function mergeTemplates(
  effectKey: string,
  server: EffectTemplateBundle | undefined,
): EffectTemplateBundle {
  const built = buildDefaultTemplates(effectKey);
  if (!server || !server.slots || server.slots.length === 0) return built;
  const slots: EffectState[] = [];
  for (let i = 0; i < TEMPLATE_COUNT; i++) {
    const s = server.slots[i];
    if (s) {
      slots.push({
        ...built.slots[i],
        ...s,
        params: { ...built.slots[i].params, ...(s.params ?? {}) },
      });
    } else {
      slots.push(built.slots[i]);
    }
  }
  const selected = Math.min(Math.max(server.selected ?? 0, 0), TEMPLATE_COUNT - 1);
  return { selected, slots };
}

/**
 * True when the given slot matches its built-in defaults within float
 * round-trip tolerance. Drives the Reset button's enabled state.
 */
export function slotMatchesDefault(effectKey: string, slotIndex: number, slot: EffectState): boolean {
  const defaults = buildDefaultTemplates(effectKey);
  const def = defaults.slots[slotIndex];
  if (!def) return false;
  const eps = 1e-4;
  if (Math.abs(slot.speed - def.speed) > eps) return false;
  if (Math.abs(slot.intensity - def.intensity) > eps) return false;
  if (Math.abs(slot.hue - def.hue) > eps) return false;
  if (Math.abs(slot.colorize - def.colorize) > eps) return false;
  if (Math.abs(slot.saturation - def.saturation) > eps) return false;
  if (Math.abs(slot.contrast - def.contrast) > eps) return false;
  const keysA = Object.keys(slot.params);
  const keysB = Object.keys(def.params);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!(k in def.params)) return false;
    if (Math.abs(slot.params[k] - def.params[k]) > eps) return false;
  }
  return true;
}

/** Upper bound on colorize selectable via the PaletteRing. Full range so
 *  the user can collapse the arc all the way to a single point (pure mono)
 *  or expand it to the full rainbow. Default SIGNATURE values for mono
 *  slots still ship at 0.75 so there's visible variation out of the box,
 *  but the UI doesn't clamp further edits. */
export const MAX_COLORIZE = 1.0;

/**
 * Short stable signature of a slot's render-affecting fields. The service renders
 * a thumbnail from the saved selected slot, so this becomes the per-effect
 * cache-bust token (see effectThumbnailPath): it changes exactly when the saved
 * look changes, which is what triggers a thumbnail refetch. Floats are rounded so
 * round-trip noise doesn't churn the token.
 */
export function slotThumbSignature(slot: EffectState): string {
  const r = (n: number) => Math.round(n * 1000);
  const parts: (string | number)[] = [
    r(slot.speed), r(slot.intensity), r(slot.hue),
    r(slot.colorize), r(slot.saturation), r(slot.contrast),
  ];
  for (const k of Object.keys(slot.params).sort()) parts.push(k, r(slot.params[k]));
  // FNV-1a 32-bit over the joined fields, emitted base36.
  let h = 0x811c9dc5;
  const str = parts.join(',');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export { BASE_DEFAULTS };
