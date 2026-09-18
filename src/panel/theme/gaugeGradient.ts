// The colour stops the value-coloured monitoring gauges paint with. Positions
// are 0-1 along a gauge's own scale (empty to full), never sensor units, so one
// list serves a load percentage and a temperature alike and the Range setting
// (adaptive / fixed) decides what the ends mean. One list per panel.

export interface GaugeGradientStop {
  at: number;
  color: string;
}

export const MIN_GAUGE_GRADIENT_STOPS = 2;
export const MAX_GAUGE_GRADIENT_STOPS = 6;

// Light blue through the cool third, amber past the middle, red before the
// limit; the ends stay flat beyond the outer stops.
export const DEFAULT_GAUGE_GRADIENT: readonly GaugeGradientStop[] = [
  { at: 0.27, color: '#4f80f0' },
  { at: 0.55, color: '#f59e0b' },
  { at: 0.85, color: '#ef4444' },
];

const HEX6_RE = /^#[0-9a-f]{6}$/;

function normalizeStop(raw: unknown): GaugeGradientStop | null {
  if (!raw || typeof raw !== 'object') return null;
  const { at, color } = raw as { at?: unknown; color?: unknown };
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof color !== 'string') return null;
  const hex = color.trim().toLowerCase();
  if (!HEX6_RE.test(hex)) return null;
  return { at: Math.max(0, Math.min(1, at)), color: hex };
}

/**
 * A stored list, sorted and clamped, or the default when it is absent or does
 * not hold at least two valid stops. Extra stops past the cap are dropped from
 * the hot end.
 */
export function normalizeGaugeGradient(raw: unknown): GaugeGradientStop[] {
  if (!Array.isArray(raw)) return [...DEFAULT_GAUGE_GRADIENT];
  const stops = raw.map(normalizeStop).filter((s): s is GaugeGradientStop => s !== null);
  if (stops.length < MIN_GAUGE_GRADIENT_STOPS) return [...DEFAULT_GAUGE_GRADIENT];
  stops.sort((a, b) => a.at - b.at);
  return stops.slice(0, MAX_GAUGE_GRADIENT_STOPS);
}

export function gaugeGradientEquals(a: readonly GaugeGradientStop[], b: readonly GaugeGradientStop[]): boolean {
  return a.length === b.length && a.every((s, i) => s.at === b[i].at && s.color === b[i].color);
}

function channel(hex: string, at: number): number {
  return parseInt(hex.slice(at, at + 2), 16);
}

/** Per-channel sRGB blend of two #rrggbb colours. */
export function mixHex(from: string, to: string, t: number): string {
  const f = Math.max(0, Math.min(1, t));
  const part = (at: number) => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * f)
    .toString(16).padStart(2, '0');
  return `#${part(1)}${part(3)}${part(5)}`;
}

/** The gradient's colour at a position 0-1; flat beyond the first and last stop. */
export function gaugeGradientColorAt(stops: readonly GaugeGradientStop[], at: number): string {
  if (stops.length === 0) return DEFAULT_GAUGE_GRADIENT[0].color;
  const t = Math.max(0, Math.min(1, at));
  if (t <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (t > next.at) continue;
    const span = next.at - prev.at;
    return span <= 0 ? next.color : mixHex(prev.color, next.color, (t - prev.at) / span);
  }
  return stops[stops.length - 1].color;
}

/**
 * Comma-separated stop list for a CSS gradient function. `alpha` (0..1) is
 * baked into each stop as #rrggbbaa: the gauges that paint a translucent
 * accent cannot use color-mix on the Q60 panel (Chromium 83).
 */
export function gaugeGradientCssStops(stops: readonly GaugeGradientStop[], alpha = 1): string {
  const suffix = alpha >= 1 ? '' : Math.round(Math.max(0, alpha) * 255).toString(16).padStart(2, '0');
  return stops.map(s => `${s.color}${suffix} ${(s.at * 100).toFixed(2)}%`).join(', ');
}

/** A full linear-gradient() along `angleDeg` (90 = left to right, 0 = bottom to top). */
export function gaugeGradientCss(stops: readonly GaugeGradientStop[], angleDeg: number, alpha = 1): string {
  return `linear-gradient(${angleDeg}deg, ${gaugeGradientCssStops(stops, alpha)})`;
}
