import { PARTICLE_DRAW_SHARE, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE, STREAK_MAX_MM, STREAK_MIN_MM, STREAK_MIN_WIDTH_PX, STREAK_SEGMENTS, STREAK_STEPS, STREAK_TAIL_WIDTH, STREAK_WIDTH_MM } from './flowParams';

/** Look of the airflow particles. The default reproduces the shipped constants; the others are explorations of fewer, longer streaks. */
export interface FlowVariant {
  name: string;
  /** Share of the particle pool that is drawn. */
  drawShare: number;
  /** Streak length is the last step's displacement times this many steps, between the bounds in mm. */
  streakSteps: number;
  streakMinMm: number;
  streakMaxMm: number;
  /** Ribbon segments: more bend the long tail along the flow more smoothly, at a cost per vertex. */
  segments: number;
  widthMm: number;
  minWidthPx: number;
  tailWidth: number;
  alpha: number;
  /** Particle life in simulation steps, and the spread of it. */
  maxAge: number;
  lifeJitter: number;
  /** Multiplier on the drawn particle speed. */
  timeScaleMul: number;
  /** Exponent of the alpha falloff from head to tail: higher fades the tail faster. */
  fadePow: number;
  /** Extra brightness at the head. */
  headGlow: number;
  /** 0 is a hard-edged ribbon with a dark rim, 1 a soft glowing one. */
  soft: number;
  /** Draws the head between the last two particle steps by the clock's remainder, and sizes the trail from the solved air speed at the head instead of the last step. */
  smooth: boolean;
  /** Steps over which a particle fades out whenever it ends, early or at the end of its life; 0 keeps the shipped behavior, where an early end respawns at once. */
  fadeOut: number;
  /** A new particle's trail is capped at the distance it has travelled since spawn, and fades in over its first moments. */
  growTail: boolean;
  /** Share of the ribbon length over which the head narrows from a point to full width; 0 leaves it blunt. */
  headTaper: number;
  /** Lowest share of the base alpha a particle draws at; each particle keeps its own share. */
  alphaVar: number;
  /** Colors every ribbon station by the air temperature where it lies, so a tail stays the cooler color it came through. */
  stationHeat: boolean;
  /** Heat shaping: the rise over the color span times the gain, raised to the curve. */
  heatGain: number;
  heatCurve: number;
  /** Blends cool to hot directly, with no purple stop. */
  directRamp: boolean;
  /** The preview page gives the case part temperatures so the air heats. */
  temps: boolean;
}

export const CURRENT_VARIANT: FlowVariant = {
  name: 'Current', drawShare: PARTICLE_DRAW_SHARE, streakSteps: STREAK_STEPS, streakMinMm: STREAK_MIN_MM, streakMaxMm: STREAK_MAX_MM, segments: STREAK_SEGMENTS,
  widthMm: STREAK_WIDTH_MM, minWidthPx: STREAK_MIN_WIDTH_PX, tailWidth: STREAK_TAIL_WIDTH, alpha: 0.95, maxAge: PARTICLE_MAX_AGE, lifeJitter: PARTICLE_LIFE_JITTER,
  timeScaleMul: 1, fadePow: 0.8, headGlow: 0, soft: 0, alphaVar: 0.25, headTaper: 0, growTail: false, fadeOut: 0, smooth: false, stationHeat: false, heatGain: 1, heatCurve: 1, directRamp: false, temps: false,
};

export const FLOW_VARIANTS: Record<string, FlowVariant> = {
  Current: CURRENT_VARIANT,
  // A: a quarter of the particles, trails four times longer, thin lines.
  A: { ...CURRENT_VARIANT, name: 'A', drawShare: PARTICLE_DRAW_SHARE / 4, streakSteps: STREAK_STEPS * 4, streakMaxMm: 420, segments: 24, widthMm: 2.5, minWidthPx: 1.2, tailWidth: 0.2, alpha: 0.9, fadePow: 1 },
  // B: an eighth of the particles, near full-path smoke lines.
  B: { ...CURRENT_VARIANT, name: 'B', drawShare: PARTICLE_DRAW_SHARE / 8, streakSteps: STREAK_STEPS * 10, streakMinMm: 40, streakMaxMm: 900, segments: 32, widthMm: 2.2, minWidthPx: 1.1, tailWidth: 0.5, alpha: 0.9, maxAge: 1400, lifeJitter: 0.2, fadePow: 0.5 },
  // C: a sixth of the particles, medium streaks, bright soft head, slower motion.
  C: { ...CURRENT_VARIANT, name: 'C', drawShare: PARTICLE_DRAW_SHARE / 6, streakSteps: STREAK_STEPS * 3, streakMinMm: 15, streakMaxMm: 300, segments: 20, widthMm: 6, minWidthPx: 2.5, tailWidth: 0.3, alpha: 0.85, timeScaleMul: 0.7, fadePow: 1.2, headGlow: 1.2, soft: 1 },
  // D: wind tunnel: sparse, long fine streamlines that fade out toward the tail, with a slight head highlight.
  D: { ...CURRENT_VARIANT, name: 'D', drawShare: PARTICLE_DRAW_SHARE / 7, streakSteps: STREAK_STEPS * 7, streakMinMm: 30, streakMaxMm: 600, segments: 28, widthMm: 3, minWidthPx: 1.4, tailWidth: 0.15, alpha: 0.85, maxAge: 1100, lifeJitter: 0.25, fadePow: 1.5, headGlow: 0.5, soft: 0.5 },
};

const A = FLOW_VARIANTS.A;
// A2: A, thicker, with each streak at its own brightness.
FLOW_VARIANTS.A2 = { ...A, name: 'A2', widthMm: 4.5, minWidthPx: 2.2, alphaVar: 0.65, alpha: 1 };
// Heat variants: the same ribbons colored by the solver's own temperature field along the path.
FLOW_VARIANTS['A2-heat-subtle'] = { ...FLOW_VARIANTS.A2, name: 'A2-heat-subtle', stationHeat: true, heatGain: 1, heatCurve: 1.6, temps: true };
FLOW_VARIANTS['A2-heat-strong'] = { ...FLOW_VARIANTS.A2, name: 'A2-heat-strong', stationHeat: true, heatGain: 2.2, heatCurve: 0.7, temps: true };
FLOW_VARIANTS['A2-heat-direct'] = { ...FLOW_VARIANTS.A2, name: 'A2-heat-direct', stationHeat: true, heatGain: 2.2, heatCurve: 0.7, directRamp: true, temps: true };
// A3: A2-heat-direct with thick streaks (20 mm) at full alpha, differing only in count.
const D = FLOW_VARIANTS['A2-heat-direct'];
FLOW_VARIANTS['A3-1'] = { ...D, name: 'A3-1', drawShare: (PARTICLE_DRAW_SHARE / 6) * 1.5, widthMm: 20, minWidthPx: 8.5, alpha: 1, headTaper: 0.22, growTail: true, fadeOut: 24, alphaVar: 0.4 };
FLOW_VARIANTS['A3-2'] = { ...D, name: 'A3-2', drawShare: (PARTICLE_DRAW_SHARE / 8) * 1.5, widthMm: 20, minWidthPx: 8.5, alpha: 1, headTaper: 0.22, growTail: true, fadeOut: 24, alphaVar: 0.4 };
FLOW_VARIANTS['A3-3'] = { ...D, name: 'A3-3', drawShare: (PARTICLE_DRAW_SHARE / 10) * 1.5, widthMm: 20, minWidthPx: 8.5, alpha: 1, headTaper: 0.22, growTail: true, fadeOut: 50, alphaVar: 0.4, smooth: true, streakSteps: 78, streakMaxMm: 550, segments: 30 };
let active: FlowVariant = CURRENT_VARIANT;
/** Chooses the look the next FlowLayer is built with. */
export const setFlowVariant = (v: FlowVariant) => { active = v; };
export const getFlowVariant = () => active;
