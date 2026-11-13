// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type Rule } from 'postcss';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const skinsDir = join(here, '../skins');
const stockFiles = [join(here, '../styles/tokens.scss'), join(here, '../../styles/variables.scss')];

function skinDeclaredProps(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(skinsDir).filter(n => n.endsWith('.scss') && !n.startsWith('_'))) {
    const css = sass.compile(join(skinsDir, f), { loadPaths: [skinsDir] }).css;
    postcss.parse(css).walkDecls(d => { if (d.prop.startsWith('--')) out.add(d.prop); });
  }
  return out;
}

function thumbResetProps(): Set<string> {
  const css = sass.compile(join(here, 'SkinPicker.module.scss')).css;
  const out = new Set<string>();
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.selector !== '.thumb') return;
    rule.walkDecls(d => { if (d.prop.startsWith('--') && d.value === 'initial') out.add(d.prop); });
  });
  return out;
}

// Declared on the card itself, so every thumbnail's card sets it the same way.
const CARD_LOCAL = new Set(['--shadow-lg']);

describe('skin picker thumbnails isolate each skin', () => {
  // A skin property no stock sheet declares has no value to fall back to, so a thumbnail would inherit it from the panel's active skin.
  it('resets every skin-only custom property on the thumbnail scope', () => {
    const stock = stockFiles.map(f => readFileSync(f, 'utf8')).join('\n');
    const reset = thumbResetProps();
    const missing = [...skinDeclaredProps()].filter(p => !reset.has(p) && !CARD_LOCAL.has(p) && !stock.includes(`${p}:`));
    expect(missing).toEqual([]);
    expect(reset.size).toBeGreaterThan(50);
  });
});
