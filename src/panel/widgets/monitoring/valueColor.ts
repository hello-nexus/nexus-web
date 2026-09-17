// Value-driven colour ramp for the monitoring gauges. A percent or temperature
// reading grades the slot's accent from the theme accent (in check) through
// --warn to --bad (too hot); every gauge design paints from --panel-accent*, so
// the ramp is applied by overriding those variables on the slot wrapper.
//
// Live colours are read off the DOM (useGaugeRamp.ts) so the ramp follows the
// user's accent and the light/dark --warn/--bad tokens without duplicating them.

import { deriveAccentVars } from '../../../lib/settings';
import type { DiagnosticsTempThresholds } from '../../../hooks/useUiSettings';
import type { DeviceKey } from './perfSlots';
import type { ScaleMode } from './perfDomain';

/** Sensor types the ramp is offered for: the percent family plus temperature. */
const COLORABLE_TYPES = new Set(['Load', 'Control', 'Level', 'Temperature']);

export function sensorSupportsValueColor(sensorType: string | undefined): boolean {
  return sensorType !== undefined && COLORABLE_TYPES.has(sensorType);
}

export type TempKind = 'cpu' | 'gpu' | 'storage' | 'ram' | 'other';

// Hot end for a temperature with no diagnostics limit of its own - VRM,
// chipset, coolant, EC. Between the GPU and storage limits: hot for a board
// sensor, not so low that a warm VRM reads critical.
const OTHER_HOT_C = 80;

// Amber sits this far below the red threshold (90 -> 70 on a stock CPU limit).
const TEMP_WARN_OFFSET_C = 20;

// Percent readings follow the same shape as a temperature: the accent holds to
// half the ceiling, amber sits short of it, 100 is fully red. Without the
// plateau an idle gauge already reads off-accent.
export const PERCENT_COOL_PCT = 50;
export const PERCENT_WARN_PCT = 70;

/** Which diagnostics limit a temperature sensor answers to. */
export function tempKindFor(device: DeviceKey, sensorName: string | undefined): TempKind {
  switch (device) {
    case 'cpu': return 'cpu';
    case 'gpu': return 'gpu';
    case 'storage':
    case 'smart': return 'storage';
    case 'memory':
    case 'memoryModule': return 'ram';
    case 'quick': {
      // Quick's summary sensors are canonically named ("CPU Temperature",
      // "GPU Temperature") - see SummarySensors.CanonicalName.
      const name = sensorName ?? '';
      if (name.startsWith('CPU')) return 'cpu';
      if (name.startsWith('GPU') || name.startsWith('VRAM')) return 'gpu';
      if (name.startsWith('Memory')) return 'ram';
      return 'other';
    }
    default: return 'other';
  }
}

export function hotTempFor(kind: TempKind, thresholds: DiagnosticsTempThresholds): number {
  switch (kind) {
    case 'cpu': return thresholds.cpuC;
    case 'gpu': return thresholds.gpuC;
    case 'storage': return thresholds.storageC;
    case 'ram': return thresholds.ramC;
    default: return OTHER_HOT_C;
  }
}

/** [accent, amber, red] anchors in the sensor's own unit. */
export type ColorStops = readonly [cool: number, warm: number, hot: number];

function validStops(cool: number, warm: number, hot: number): ColorStops | null {
  if (!Number.isFinite(cool) || !Number.isFinite(warm) || !Number.isFinite(hot)) return null;
  return cool < warm && warm < hot ? [cool, warm, hot] : null;
}

/**
 * Half the limit is where the accent ends: the stock 90/85/70/60 °C limits give
 * 45/42.5/35/30, all plausible idle readings for their part, and a lowered
 * limit tightens the whole ramp with it. Percent readings use the same shape.
 */
export function temperatureStops(kind: TempKind, thresholds: DiagnosticsTempThresholds): ColorStops | null {
  const hot = hotTempFor(kind, thresholds);
  const cool = hot / 2;
  return validStops(cool, Math.max(cool + 1, hot - TEMP_WARN_OFFSET_C), hot);
}

/**
 * Colour anchors for a slot, or null when this sensor/range combination has no
 * ramp. Fixed range colours across the user's own [min, max] window (amber at
 * its midpoint); Adaptive uses the absolute limits instead, so red means the
 * part is actually hot rather than merely at the top of what has been observed.
 */
export function valueColorStops(
  device: DeviceKey,
  sensorType: string | undefined,
  sensorName: string | undefined,
  scale: ScaleMode,
  domainMin: number,
  domainMax: number,
  thresholds: DiagnosticsTempThresholds,
): ColorStops | null {
  if (!sensorSupportsValueColor(sensorType)) return null;
  if (scale === 'fixed') return validStops(domainMin, (domainMin + domainMax) / 2, domainMax);
  if (sensorType === 'Temperature') return temperatureStops(tempKindFor(device, sensorName), thresholds);
  return validStops(PERCENT_COOL_PCT, PERCENT_WARN_PCT, 100);
}

/** 0 at the cool stop, 0.5 at the warm stop, 1 at the hot stop; clamped outside. */
export function gradeFraction(raw: number, stops: ColorStops): number {
  const [cool, warm, hot] = stops;
  if (!Number.isFinite(raw) || raw <= cool) return 0;
  if (raw >= hot) return 1;
  return raw < warm
    ? 0.5 * ((raw - cool) / (warm - cool))
    : 0.5 + 0.5 * ((raw - warm) / (hot - warm));
}

/** The three ramp anchors as #rrggbb, plus the theme they were read under. */
export interface GaugeRamp {
  accent: string;
  warn: string;
  bad: string;
  mode: 'dark' | 'light';
}

function toHex(r: number, g: number, b: number): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sN = Math.max(0, Math.min(100, s)) / 100;
  const lN = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  const m = lN - c / 2;
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Any opaque CSS colour the accent and status tokens resolve to, as #rrggbb.
 * The accent family is authored as hsl()/hsla() (never color-mix - the Q60
 * panel is Chromium 83), the status tokens as hex, so both forms reach here.
 * Alpha is dropped: the ramp mixes base colours and re-derives its own tiers.
 */
export function cssColorToHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.startsWith('#')) {
    if (/^#[0-9a-f]{6}$/.test(value)) return value;
    if (/^#[0-9a-f]{8}$/.test(value)) return value.slice(0, 7);
    if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    return null;
  }
  const nums = value.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 3) return null;
  if (value.startsWith('rgb')) return toHex(Number(nums[0]), Number(nums[1]), Number(nums[2]));
  if (value.startsWith('hsl')) return hslToHex(Number(nums[0]), Number(nums[1]), Number(nums[2]));
  return null;
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

// How much of the accent leg holds the accent untouched before the crossfade
// into amber starts. The default accent is blue, near amber's complement, so
// blending the two across the whole leg spends it in grey (#787b91 a fifth of
// the way in) - a warming part would read as a dead gauge. Holding, then
// crossing quickly, keeps "in check" unmistakably themed and confines the
// washed-out crossover to a band the reading passes through.
const ACCENT_HOLD = 0.7;

// Smoothstep across the crossover: steepest at its midpoint, so the reading
// spends the least range on the washed-out blend and settles quickly on amber.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function rampColorAt(ramp: GaugeRamp, fraction: number): string {
  if (fraction > 0.5) return mixHex(ramp.warn, ramp.bad, (fraction - 0.5) * 2);
  const leg = Math.max(0, fraction) * 2;
  return leg <= ACCENT_HOLD
    ? ramp.accent
    : mixHex(ramp.accent, ramp.warn, smoothstep((leg - ACCENT_HOLD) / (1 - ACCENT_HOLD)));
}

/**
 * The --panel-accent* overrides for one graded slot. deriveAccentVars produces
 * the same glow/soft/shadow family panelTheme builds from the user's accent, so
 * a graded gauge keeps every shape's highlight and glow consistent.
 */
export function gradedAccentVars(ramp: GaugeRamp, fraction: number): Record<string, string> {
  const vars = deriveAccentVars(rampColorAt(ramp, fraction), ramp.mode);
  return {
    '--panel-accent': vars['--accent'],
    '--panel-accent-glow': vars['--accent-glow'],
    '--panel-accent-soft': vars['--accent-soft'],
    '--panel-accent-shadow': vars['--accent-glow-shadow'],
    '--panel-accent-text': vars['--accent-text'],
  };
}
