// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The ramp the streaks draw: five token stops, each segment a straight OKLab mix. Pins the tokens to a ramp that never turns green or gray between blue and red. */
const STOPS = ['--airflow-cool', '--airflow-pale', '--airflow-warm', '--airflow-orange', '--bad'] as const;
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const hex = (h: string) => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
function lab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function themes(file: string): Record<string, string>[] {
  const css = readFileSync(new URL(file, import.meta.url), 'utf8');
  const blocks = css.split(/\n(?=[^\s].*\{)/).filter(b => b.includes('--airflow-cool'));
  return blocks.map(b => Object.fromEntries(STOPS.map(k => [k, new RegExp(`${k}:\\s*(#[0-9a-fA-F]{6})`).exec(b)?.[1] ?? ''])));
}

describe('heat ramp tokens', () => {
  const sets = [...themes('../../../panel/styles/tokens.scss'), ...themes('../../../styles/variables.scss')];
  it('finds a complete set of stops in every theme block', () => {
    expect(sets.length).toBeGreaterThanOrEqual(4);
    for (const set of sets) for (const k of STOPS) expect(set[k], k).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('never passes a green hue, and the light stop is near white, so blue to yellow is neither gray nor green', () => {
    for (const set of sets) {
      const stops = STOPS.map(k => lab(hex(set[k])));
      for (let i = 0; i <= 200; i++) {
        const x = (i / 200) * (stops.length - 1);
        const s = Math.min(Math.floor(x), stops.length - 2);
        const t = x - s;
        const [L, a, b] = stops[s].map((v, c) => v + (stops[s + 1][c] - v) * t);
        const chroma = Math.hypot(a, b);
        const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
        if (chroma > 0.02) expect(hue < 105 || hue > 200, `hue ${hue.toFixed(0)} at ${i / 200}`).toBe(true);
        // A mid-ramp color is either clearly colored or light: never a dull gray.
        expect(chroma > 0.04 || L > 0.85 || L < 0.5, `gray at ${i / 200}`).toBe(true);
      }
    }
  });
});
