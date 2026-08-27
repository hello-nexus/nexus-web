// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Source-level guard, and only that: jsdom implements no touch-action
// semantics, so no rendered-component test in this suite can prove a pinch is
// refused. What it does catch is the silent regression - the overlay renders
// outside the grid's .panelRoot, so dropping this declaration makes immersive
// content pinch-zoomable again with nothing on screen to show for it.
describe('immersive overlay touch-action', () => {
  const css = readFileSync(join(__dirname, 'PanelImmersiveOverlay.module.scss'), 'utf8')
    // Comments in this file discuss `touch-action: none` by name, which would
    // satisfy the negative assertion below on prose alone.
    .replace(/^\s*\/\/.*$/gm, '');
  // Scan line-wise to the block's own closing brace (column 0), mirroring
  // src/panel/chromium83Floor.test.ts. Slicing to the first `}` would truncate
  // at any nested `&[data-x] {}` or `@media` added above the declaration.
  const lines = css.split('\n');
  const start = lines.findIndex(l => l.startsWith('.overlay {'));
  const end = lines.findIndex((l, i) => i > start && l === '}');
  const overlayBlock = lines.slice(start, end).join('\n');

  it('withholds pinch-zoom from immersive content', () => {
    expect(overlayBlock).toMatch(/touch-action:\s*pan-x pan-y/);
  });

  it('does not use `none`, which would kill native scrolling in immersive pages', () => {
    expect(overlayBlock).not.toMatch(/touch-action:\s*none/);
  });
});
