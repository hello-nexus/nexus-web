// @vitest-environment node
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type AtRule, type Rule } from 'postcss';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const sheets = readdirSync(dir).filter(f => f.endsWith('.scss') && !f.startsWith('_'));

// Skin CSS is never unloaded, so a selector outside the skin scope would keep applying after the skin is turned off.
const SCOPED = /^(\[data-panel-widget-id\]:nth-child\(even\) > )?(\.panel-root\[data-(panel-skin|skin-root)|\[data-skin-part=['"]?surface['"]?\]\.panel-root\[data-panel-skin\])/;

function selectors(file: string): string[] {
  const css = sass.compile(join(dir, file), { loadPaths: [dir] }).css;
  const out: string[] = [];
  postcss.parse(css).walkRules((rule: Rule) => {
    const parent = rule.parent as AtRule | undefined;
    if (parent?.type === 'atrule' && /keyframes|font-face/.test(parent.name)) return;
    out.push(...rule.selectors);
  });
  return out;
}

describe('skin stylesheets stay scoped to the skin', () => {
  it('finds the stylesheets', () => {
    expect(sheets).toContain('skinBase.scss');
    expect(sheets.length).toBeGreaterThan(20);
  });

  it.each(sheets)('%s emits only scoped selectors', file => {
    const loose = selectors(file).filter(sel => !SCOPED.test(sel.trim()));
    expect(loose).toEqual([]);
  });

  // A skin recolors artwork through tokens and restyles only parts a widget marks, never every svg or media element.
  const ARTWORK = /(^|[\s>+~(,])(svg|path|line|polyline|polygon|rect|circle|ellipse|img|canvas|video)(?![\w-])/;
  it.each(sheets)('%s never targets bare artwork elements', file => {
    const bare = selectors(file).filter(sel => {
      const stripped = sel.replace(/\[[^\]]*\]/g, m => (m.includes('data-skin-part') ? '[part]' : '[]'));
      return ARTWORK.test(stripped) && !sel.includes('data-skin-part');
    });
    expect(bare).toEqual([]);
  });
});
