// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pins the border-width override that keeps full-bleed SDK content flush with its card's rounded clip.
describe('SDK full-bleed widget has no border-box inset', () => {
  it('zeroes the panel-card border width for marketplace widget types', () => {
    const src = readFileSync(join(__dirname, 'tokens.scss'), 'utf8');
    const rule = /\.panel-card\[data-widget-type\^='app:'\][^{]*\.panel-card\[data-widget-type\^='marketplace:'\][^{]*\{([^}]*)\}/;
    const match = src.match(rule);
    expect(match, 'expected a .panel-card[data-widget-type] override in tokens.scss').not.toBeNull();
    expect(match![1]).toMatch(/border-width:\s*0/);
  });
});
