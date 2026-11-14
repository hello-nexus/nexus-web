import { describe, expect, it } from 'vitest';
import { SURFACE_SPECS, hexToRgb, sakuraBlossomVars, skinAccentVars, skinSurfaceVars } from './skins';

function lum(hex: string): number {
  const c = hexToRgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('accent-derived skin surfaces', () => {
  const accents = ['#ff4fa3', '#2f6bff', '#2fbf71', '#ff8a2a', '#ffd400', '#ffffff'];
  for (const id of Object.keys(SURFACE_SPECS) as (keyof typeof SURFACE_SPECS)[]) {
    for (const accent of accents) {
      for (const mode of ['light', 'dark'] as const) {
        it(`${id} ${mode} secondary ink reads on card and backdrop with ${accent}`, () => {
          const v = skinSurfaceVars(id, accent);
          expect(ratio(v[`--skin-sf-dim-${mode}`], v[`--skin-sf-card-${mode}`])).toBeGreaterThanOrEqual(4.5);
          expect(ratio(v[`--skin-sf-dim-${mode}`], v[`--skin-sf-back-${mode}`])).toBeGreaterThanOrEqual(4.5);
          expect(ratio(v[`--skin-sf-text-${mode}`], v[`--skin-sf-card-${mode}`])).toBeGreaterThanOrEqual(7);
        });
      }
    }
  }
});

describe('Sakura blossom colors', () => {
  for (const accent of ['#e8799a', '#2f6bff', '#ffffff']) {
    it(`keeps petals opaque and close to the card face for ${accent}`, () => {
      const vars = sakuraBlossomVars(accent);
      const sf = skinSurfaceVars('sakura', accent);
      for (const mode of ['light', 'dark'] as const) {
        expect(vars[`--sk-petal-${mode}`]).toMatch(/^#[0-9a-f]{6}$/);
        expect(vars[`--sk-core-${mode}`]).toMatch(/^#[0-9a-f]{6}$/);
        expect(ratio(vars[`--sk-petal-${mode}`], sf[`--skin-sf-card-${mode}`])).toBeLessThan(1.35);
      }
    });
  }

  it('rides with the skin accent vars', () => {
    expect(skinAccentVars('sakura', '#e8799a')).toHaveProperty('--sk-petal-light');
  });
});
