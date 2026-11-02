// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The dashboard's WebView on a PC with a touchscreen reports (hover: none),
// (any-hover: none) and (pointer: none), so a hover reveal behind a hover media
// query never shows there and the preview's edit notices vanish.
const css = readFileSync(join(__dirname, 'PanelApp.module.scss'), 'utf8');

function mediaEnclosing(selectorPart: string): string[] {
  const at = css.indexOf(selectorPart);
  expect(at, `${selectorPart} exists`).toBeGreaterThan(-1);
  const stack: string[] = [];
  let head = 0;
  for (let i = 0; i < at; i++) {
    if (css[i] === '{') { stack.push(css.slice(head, i).trim()); head = i + 1; }
    else if (css[i] === '}') { stack.pop(); head = i + 1; }
    else if (css[i] === ';') head = i + 1;
  }
  return stack.filter(h => h.startsWith('@media'));
}

describe('device-page preview hover notices', () => {
  it.each([
    ".panelRoot[data-simulator='true'] .cellWrap:hover .cell > .cellEditHint",
    '.hintSplit:hover > .hintHalf > [data-edit-hint-overlay]',
    '.hintSplit > .hintHalf:hover > [data-edit-hint-overlay]',
  ])('reveals %s without a hover media query', selector => {
    expect(mediaEnclosing(selector).filter(h => /hover/.test(h))).toEqual([]);
  });

  it('colors the Edit background notice from the same token as Edit widget, not its own', () => {
    expect(css).not.toContain('--edit-hint-color');
  });
});
