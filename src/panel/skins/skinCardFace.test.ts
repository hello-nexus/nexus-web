// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_FACE } from './skins';

// Glass paints a translucent card, so its table entry is a composite with no stylesheet literal.
const COMPOSITE = new Set(['glass']);

function cardFills(scss: string): Set<string> {
  const out = new Set<string>();
  for (const m of scss.matchAll(/--skin-card-bg:\s*(#[0-9a-f]{3,6})/gi)) out.add(m[1].toLowerCase());
  for (const m of scss.matchAll(/@include kit\(#[0-9a-f]{3,6},\s*(#[0-9a-f]{3,6})/gi)) out.add(m[1].toLowerCase());
  return out;
}

describe('card face table matches the skin stylesheets', () => {
  for (const [id, face] of Object.entries(CARD_FACE)) {
    if (COMPOSITE.has(id)) continue;
    it(id, () => {
      const fills = cardFills(readFileSync(join(__dirname, `${id}.scss`), 'utf8'));
      expect(fills.has(face.light)).toBe(true);
      expect(fills.has(face.dark)).toBe(true);
    });
  }
});
