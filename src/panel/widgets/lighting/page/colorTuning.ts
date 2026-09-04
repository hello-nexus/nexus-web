import type { LightingColorAdjust } from '../../../../api/lighting';

export type Rgb = readonly [number, number, number];

/** How far a full-scale temperature shift moves the red/blue gains. Mirrors
 *  `DeviceColorAdjust.TemperatureSpan` in nexus-service - the preview is only
 *  honest while the two agree. */
const TEMPERATURE_SPAN = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function isNeutralAdjust(a: LightingColorAdjust): boolean {
  return a.red === 1 && a.green === 1 && a.blue === 1 && a.temperature === 0 && a.saturation === 1;
}

/**
 * CPU mirror of `DeviceColorAdjust.Apply` in nexus-service: saturation around
 * Rec.709 luma first, then the per-channel gains with the warm/cool shift
 * folded into red and blue. Brightness is deliberately not applied here - the
 * preview shows the colour shift, not how dim the device is.
 */
export function applyColorAdjust(source: Rgb, adjust: LightingColorAdjust): Rgb {
  let [r, g, b] = source;
  const sat = clamp(adjust.saturation, 0, 2);
  if (sat !== 1) {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;
  }
  const t = clamp(adjust.temperature, -1, 1);
  const gainR = clamp(adjust.red, 0.3, 1.7) * (1 + TEMPERATURE_SPAN * t);
  const gainG = clamp(adjust.green, 0.3, 1.7);
  const gainB = clamp(adjust.blue, 0.3, 1.7) * (1 - TEMPERATURE_SPAN * t);
  return [
    clamp(Math.round(r * gainR), 0, 255),
    clamp(Math.round(g * gainG), 0, 255),
    clamp(Math.round(b * gainB), 0, 255),
  ];
}

export const toCss = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

function hueToRgb(deg: number): Rgb {
  const h = ((deg % 360) + 360) % 360 / 60;
  const x = Math.round(255 * (1 - Math.abs((h % 2) - 1)));
  if (h < 1) return [255, x, 0];
  if (h < 2) return [x, 255, 0];
  if (h < 3) return [0, 255, x];
  if (h < 4) return [0, x, 255];
  if (h < 5) return [x, 0, 255];
  return [255, 0, x];
}

/**
 * The reference colours the shift ribbon walks: a full hue sweep, then a short
 * neutral ramp. The neutrals earn their place - a colour-temperature trim is
 * hardest to read on a saturated hue and obvious on white.
 */
export const RIBBON_SAMPLES: Rgb[] = [
  ...Array.from({ length: 24 }, (_, i) => hueToRgb((i * 360) / 24)),
  [255, 255, 255],
  [190, 190, 190],
  [125, 125, 125],
  [70, 70, 70],
];
