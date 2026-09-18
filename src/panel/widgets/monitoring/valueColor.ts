// Value colouring for the monitoring gauges: the panel's gauge gradient (see
// gaugeGradient.ts) painted into a gauge's own scale, plus an accent tint at
// the current reading for the parts that are not the figure (number, glow).
// Every gauge design paints from --panel-accent*, so the tint is applied by
// overriding those variables on the slot wrapper.

import { deriveAccentVars } from '../../../lib/settings';
import { gaugeGradientColorAt, type GaugeGradientStop } from '../../theme/gaugeGradient';
import type { GaugeDesignKey } from './gauges/types';

/** Sensor types the colouring is offered for: the percent family plus temperature. */
const COLORABLE_TYPES = new Set(['Load', 'Control', 'Level', 'Temperature']);

export function sensorSupportsValueColor(sensorType: string | undefined): boolean {
  return sensorType !== undefined && COLORABLE_TYPES.has(sensorType);
}

/** Every design paints from the accent except the plain number. */
export function designSupportsValueColor(design: GaugeDesignKey): boolean {
  return design !== 'text';
}

/** The panel gradient bound to one rendered gauge. */
export interface GaugeGradient {
  /** Unique per slot; SVG def ids derive from it. */
  id: string;
  /** Colours at positions 0..1 along the gauge's scale, ascending. */
  stops: readonly GaugeGradientStop[];
}

/**
 * The --panel-accent* overrides for a slot whose reading sits at `at` (0..1)
 * on its gauge's scale. deriveAccentVars produces the same glow/soft/shadow
 * family panelTheme builds from the user's accent, so the tinted number and
 * glow stay consistent with every other accent-coloured surface.
 */
export function gaugeAccentVars(
  stops: readonly GaugeGradientStop[],
  at: number,
  mode: 'dark' | 'light',
): Record<string, string> {
  const vars = deriveAccentVars(gaugeGradientColorAt(stops, at), mode);
  return {
    '--panel-accent': vars['--accent'],
    '--panel-accent-glow': vars['--accent-glow'],
    '--panel-accent-soft': vars['--accent-soft'],
    '--panel-accent-shadow': vars['--accent-glow-shadow'],
    '--panel-accent-text': vars['--accent-text'],
  };
}
