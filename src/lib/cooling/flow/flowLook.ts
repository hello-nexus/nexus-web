import { PARTICLE_DRAW_SHARE, PARTICLE_LIFE_JITTER, PARTICLE_MAX_AGE } from './flowParams';

/** How the airflow streaks are drawn and how the particles behave while they live and when they end. */
export interface FlowLook {
  /** Share of the particle pool that is drawn. */
  drawShare: number;
  /** Streak width in scene mm, and the narrowest it is drawn on screen, px. */
  widthMm: number;
  minWidthPx: number;
  /** Alpha of the brightest streak, and the lowest share of it a streak is drawn at; each streak keeps its own share. */
  alpha: number;
  alphaVar: number;
  /** Particle life in simulation steps, and the spread of it. */
  maxAge: number;
  lifeJitter: number;
  /** Multiplier on the drawn particle speed. */
  timeScaleMul: number;
  /** Exponent of the alpha falloff from head to tail. */
  fadePow: number;
  /** Share of the ribbon over which the head narrows from a point, and over which its alpha ramps up from nothing. */
  headTaper: number;
  headFade: number;
  /** Steps over which a particle fades out whenever it ends, early or at the end of its life; 0 respawns an early end at once. */
  fadeOut: number;
  /** Share of the outside reach past the case face where a stream leaving the case starts its time-based fade; 0 leaves that to the bounds. */
  exitShare: number;
  /** Where the distance fade outside the case starts, as a share of the outside reach. */
  marginStart: number;
  /** How much a particle leaving the case slows by the time it reaches the outside reach. */
  outDecay: number;
  /** Perceptual speed mapping of the particles: a gamma under one lifts slow air toward `speedRef` (cells per solver step) and eases fast air down; 1 draws the solved speed as it is. */
  speedGamma: number;
  /** The gamma used above `speedRef`, gentler so fast air still grows with its speed. */
  speedGammaHi: number;
  speedRef: number;
  /** Particle steps of recorded travel a trail spans, and its ribbon segments. */
  trailSteps: number;
  segments: number;
  /** Width by speed: [slow, fast, narrowest share]. Speeds are mm per particle step. */
  speedWidth: readonly [number, number, number];
  /** Heat shaping: the rise over the color span times the gain, raised to the curve. */
  heatGain: number;
  heatCurve: number;
}

/** The streaks as they are drawn. */
export const FLOW_LOOK: FlowLook = {
  drawShare: (PARTICLE_DRAW_SHARE / 10) * 1.5 * 2 * 1.5,
  widthMm: 26, minWidthPx: 14, alpha: 1, alphaVar: 0.25,
  maxAge: PARTICLE_MAX_AGE, lifeJitter: PARTICLE_LIFE_JITTER, timeScaleMul: 1.6, fadePow: 1,
  headTaper: 0.22, headFade: 0.28, fadeOut: 120, exitShare: 0, marginStart: 0.05, outDecay: 0.6, speedGamma: 0.4, speedGammaHi: 0.85, speedRef: 0.25,
  trailSteps: 55, segments: 32, speedWidth: [0.3, 5, 0.18], heatGain: 2.2, heatCurve: 0.7,
};

/** The same look with the particle behavior the CPU reference does not model switched off, for the GL parity harness. */
export const PARITY_LOOK: FlowLook = { ...FLOW_LOOK, fadeOut: 0, exitShare: 0, outDecay: 0, speedGamma: 1, speedGammaHi: 1 };
