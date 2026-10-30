// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The overlay's WebViews report no hover or pointer capability, so the tile's edit hint
// has to key on the mouse marker lib/pointerKind puts on <body>, not on a media query.
const css = readFileSync(join(__dirname, 'EffectCard.module.scss'), 'utf8');

describe('EffectCard edit hint reveal', () => {
  it('is keyed on the mouse marker, not a hover or pointer media query', () => {
    expect(css).toContain(":global(body[data-pointer='mouse']) .card:hover [data-edit-hint-overlay]");
    // The build prefixes :hover rules with an html ancestor, which a selector rooted at html can never match.
    expect(css).not.toContain(':global(html[');
    expect(css).not.toMatch(/@media[^{]*(hover|pointer)/);
  });
});
