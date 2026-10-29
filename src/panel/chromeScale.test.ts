// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Floating chrome must read --panel-chrome-scale (the Large grid's scale), never the widget grid's --panel-scale,
// or a finer Widget size would shrink menus, sheets and the tray with the cells.
const CHROME_STYLES = [
  'widgets/common/WidgetContextMenu.module.scss',
  'chrome/PanelControlCenter.module.scss',
  'chrome/PanelSwipeHint.module.scss',
  'chrome/PanelActionsTray.module.scss',
];

describe('floating chrome scale', () => {
  for (const file of CHROME_STYLES) {
    it(`${file} sizes from the chrome scale`, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      const uses = source.split('\n').filter(line => !line.trim().startsWith('//') && line.includes('var(--panel-scale'));
      for (const line of uses) expect(line).toContain('--panel-chrome-scale');
      expect(source).toContain('--panel-chrome-scale');
    });
  }
});
