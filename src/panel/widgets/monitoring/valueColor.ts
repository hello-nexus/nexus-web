// Value colouring for the monitoring gauges: the panel's gauge gradient (see
// gaugeGradient.ts) painted into a gauge's own scale, plus an accent tint at
// the current reading for the parts that are not the figure (number, glow).
// Every gauge design paints from --panel-accent*, so the tint is applied by
// overriding those variables on the slot wrapper.

import { deriveAccentVars } from '../../../lib/settings';
import { gaugeGradientColorAt, gaugeGradientCss, type GaugeGradientStop } from '../../theme/gaugeGradient';
import type { GaugeDesignKey } from './gauges/types';
import type { DeviceKey } from './perfSlots';

/** Any resolved sensor; FPS qualifies by device as the settings pane has no fps stream to resolve. */
export function sensorSupportsValueColor(sensorType: string | undefined, device?: DeviceKey): boolean {
  return device === 'fps' || sensorType !== undefined;
}

/** FPS reads 0 while no game is presenting: no reading to tint. */
export function hasValueColorReading(device: DeviceKey, rawValue: number): boolean {
  return device !== 'fps' || rawValue > 0;
}

/** Headroom readings, where more is better: free space, available memory, remaining life. */
const HEADROOM_NAME = /\b(Free|Available|Life)\b/;

/**
 * Unset, the frame rate and headroom readings run reversed (a drop is the
 * warning); every other sensor runs hot-high. `sensorName` is the resolved
 * sensor's display name, not a stored sensor id.
 */
export function defaultValueColorReverse(device: DeviceKey, sensorName: string): boolean {
  if (device === 'fps') return sensorName !== 'Frame Time';
  return HEADROOM_NAME.test(sensorName);
}

/** The same gradient read from the full end, so low readings take the hot colours. */
export function reverseGaugeGradient(stops: readonly GaugeGradientStop[]): GaugeGradientStop[] {
  return stops.map(s => ({ at: 1 - s.at, color: s.color })).reverse();
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
  /** Alpha for a translucent body, matching the accent-shadow tier of the panel's theme. */
  bodyAlpha: number;
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

/** The graded counterpart of --panel-accent-shadow: the gradient at the body's alpha. */
export function gaugeBodyCss(gradient: GaugeGradient, angleDeg: number): string {
  return gaugeGradientCss(gradient.stops, angleDeg, gradient.bodyAlpha);
}
