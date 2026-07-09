import type { EffectState } from '../types/lighting';

/**
 * Frozen slot-0 looks for the site demo effects, copied from the service's
 * canonical default templates (nexus-service data/default-animate-templates.json).
 * The marketing site is static - there is no service to fetch
 * /lighting/animate/defaults from - so the demo pins the handful of looks it
 * renders. Keep in sync with DEMO_EFFECTS in LightingSection.
 */
export const DEMO_SLOT_ZERO: Record<string, EffectState> = {
  plasma: {
    speed: 60, intensity: 1, hue: 0.85, colorize: 0.3, saturation: 1, contrast: 1,
    params: { u_warp: 1, u_zoom: 1 },
  },
  fire: {
    speed: 70, intensity: 1, hue: 0.03, colorize: 0.8, saturation: 1.1, contrast: 1.05,
    params: { u_turbulence: 1.6 },
  },
  spiral: {
    speed: 50, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1,
    params: { u_arms: 5, u_tightness: 8 },
  },
  neongrid: {
    speed: 70, intensity: 1, hue: 0.58, colorize: 0.55, saturation: 1.2, contrast: 1.1,
    params: { u_density: 12, u_pulse: 1.2, u_glow: 1.2 },
  },
  beatbuilder: {
    speed: 50, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1,
    params: { u_colorMode: 1, u_centerStyle: 0, u_barWidth: 0.85, u_centerSize: 0.9, u_beatPulse: 0.3 },
  },
};
