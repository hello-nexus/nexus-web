import { describe, expect, it } from 'vitest';
import { PANEL_SKINS, hexToRgb, skinAccentInk, skinAccentVars, type SkinDef } from './skins';

function lum(hex: string): number {
  const c = hexToRgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const ACCENTS = ['default', '#ff4fa3', '#2f6bff', '#2fbf71', '#ff8a2a', '#1a1a8a'];

describe('accent as text on the card face', () => {
  for (const def of PANEL_SKINS as readonly SkinDef[]) {
    for (const accent of ACCENTS) {
      const hex = accent === 'default' ? (def.accent ?? '#2563eb') : accent;
      for (const mode of ['light', 'dark'] as const) {
        it(`${def.id} ${mode} with ${accent}`, () => {
          const v = skinAccentVars(def.id, hex);
          const pairs: Array<[string, string]> = [];
          const r = skinAccentInk(def.id, hex, mode);
          if (r) pairs.push([v[`--skin-accent-ink-${mode}`], r.face]);
          if (def.id === 'neon' && mode === 'dark') pairs.push([v['--skin-accent2-ink-dark'], r!.face]);
          if (def.id === 'crt') {
            pairs.push(mode === 'dark' ? [v['--crt-ink'], v['--crt-bg']] : [v['--crt-paper-ink'], v['--crt-paper-bg']]);
            pairs.push(mode === 'dark' ? [v['--crt-dim'], v['--crt-bg']] : [v['--crt-paper-dim'], v['--crt-paper-bg']]);
          }
          if (def.id === 'vfd') {
            pairs.push(mode === 'dark' ? [v['--skin-lit'], v['--skin-night']] : [v['--skin-vfd-day-ink'], v['--skin-vfd-day-bg']]);
            pairs.push(mode === 'dark' ? [v['--skin-lit'], v['--skin-night']] : [v['--skin-vfd-day-dim'], v['--skin-vfd-day-bg']]);
          }
          if (def.id === 'lcd') pairs.push(mode === 'dark' ? [v['--skin-deep'], v['--skin-glow']] : [v['--skin-deep'], v['--skin-pale']]);
          if (def.id === 'blueprint' && mode === 'light') pairs.push([v['--skin-accent-deep'], '#f9f7f0']);
          if (def.id === 'blueprint' && mode === 'dark') return;
          expect(pairs.length).toBeGreaterThan(0);
          for (const [ink, face] of pairs) expect(ratio(ink, face)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
